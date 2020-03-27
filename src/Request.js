'use strict';

const debug = require('debug')('lb-declarative-e2e-test'),
  request = require('supertest');
  const callbackOrValue = async (o) => (typeof o === 'function') ? await o() : o;

class Request {

  constructor(app, definition = {}) {
    this.app = app;
    this.definition = definition;
  }

  static getUrl(url) {
    return callbackOrValue(url);
  }

  static getAuth(auth) {
    return callbackOrValue(auth);
  }

  static async buildRequest(app, definition) {
    const url = await Request.getUrl(definition.url);
    debug(`Building ${definition.verb} request for ${url}`);

    let request;
    request = Request.getSuperTest()(app)[definition.verb](url);
    request = Request.applyHeaders(request, definition.headers);
    request = await Request.applyBody(request, definition.body);

    return request;
  }

  async build(app = this.app, definition = this.definition) {
      this._request = await Request.buildRequest(app, definition);
      // return Promise.resolve(this);
      return this;
  }

  static async make(app, definition) {
    const r = await (new Request(app, definition)).build();
    return r;
  }

  static async processRequest(app, definition, config) {
    definition = {
      ...definition,
      url: config.baseUrl ? config.baseUrl + definition.url : definition.url // FIXME definition.url could be function
    };

    // FIXME audit this
    if (definition.headers || config.headers) {
      debug('Merging definition headers with global config headers');
      definition.headers = {
        ...config.headers,
        ...definition.headers
      };
    } else {
      debug('No header found');
    }

    const defExpect = definition.expect || {};
    const configExpect = config.expect;

    if ((defExpect && defExpect.headers) || (configExpect && configExpect.headers)) {
      definition.expect = {
        ...configExpect,
        ...defExpect,
        headers: {
          ...configExpect.headers,
          ...defExpect.headers
        }
      };
    } else {
      debug('No expected header found');
    }

    if (definition.error || config.error) {
      definition.error = definition.error || config.error;
    }

    const req = await Request.make(app, definition);
    return req.test();
  }

  static async processAuthenticatedRequest(app, definition, config) {
    const tokenId = await Request.sendAuth(app, definition.auth, config);
    return await Request.processRequest(app, {
        ...definition,
        headers: {
            ...definition.headers,
            Authorization: tokenId
        }
    }, config);
  }

  static async processRequestDefinition(app, definition, config) {
    const auth = await Request.getAuth(definition.auth);
    definition = {...definition, auth};

    if (!definition.auth) {
      debug('No auth defined');
      return Request.processRequest(app, definition, config);
    }

    if (Array.isArray(definition.auth)) {
      debug(`Auth defined with ${definition.auth.length} users`);
      return Promise.all(
        definition.auth.map(auth =>
          Request.processAuthenticatedRequest(app, {
            ...definition,
            auth
          }, config))
      );
    }

    debug('Auth defined for a single user');
    return Request.processAuthenticatedRequest(app, definition, config);
  }

  static process(app, definition, config) { // async ?
    if (definition.steps) {
      return definition.steps.reduce((previousRequest, stepDef, index) => {
        return previousRequest.then(response => { // async ?
          debug(`Processing step ${index}`);
          stepDef = typeof stepDef === 'function' ? stepDef(response) : stepDef;

          return Request.processRequestDefinition(app, { // await ?
            ...definition,
            ...stepDef
          }, config);
        });


      }, Promise.resolve());
    }

    return Request.processRequestDefinition(app, definition, config);
  }

  get request() {
    return this._request;
  }

  get expected() {
    return this.definition.expect;
  }

  static getSuperTest() {
    return request;
  }

  static applyHeaders(request, headers) {
    if (!headers) {
      debug('No header defined');
      return request;
    }

    const keys = Object.keys(headers);

    debug(`Applying ${keys.length} headers: ${keys.join(', ')}`);
    keys.forEach(key => {
      request = request.set(key, headers[key]);
    });

    return request;
  }

  static async applyBody(request, body) {
    if (!body) {
      debug('No body defined');
      return request;
    }

    // FIXME use callbackOrValue
    const isFunc = typeof body === 'function';
    debug(`Applying body ${isFunc ? 'from function' : 'object'}`);
    return request.send(isFunc ? await body() : body);
  }

  static sendAuth(app, auth, config) {
    if (typeof auth === 'string') {
      debug('auth token provided, skipping login request');
      return Promise.resolve(auth);
    }

    debug(`Sending login request to ${config.auth.url} with user ${JSON.stringify(auth)}`);
    return Request.getSuperTest()(app)
      .post(config.auth.url)
      .send(auth)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .then(res => {
        if (res.body.error) {
          debug(`Login request to ${config.auth.url} with user ${JSON.stringify(auth)} failed`);
          throw res.body.error;
        }

        debug('Login request succeeded');
        return res.body.id;
      });
  }

  test() {
    debug('Executing tests on the response');

    const expected = this.expected,
      headers = expected.headers,
      body = expected.body;

    this._expect(res => this._response = res)
      .catch(err => this._onTestError(err));

    if (typeof expected !== 'object' || (body === undefined && headers === undefined)) {
      debug('Testing response with provided expect value');
      return this._expect(expected);
    }

    if (headers) {
      debug('Testing response headers');
      Object.keys(headers).forEach(key => {
        // fix for supertest not accepting expect('status', xxx)
        if (key === 'status' || key === 'Status-Code') {
          return this._expect(headers[key]);
        }

        this._expect(key, headers[key]);
      });
    }

    if (body) {
      debug('Testing response body');
      this._expect(typeof body === 'function' ? body() : body);
    }

    return this.request;
  }

  _onTestError(err) {
    debug('Test failed with error:', err);

    if (!this.definition.error) {
      debug('Provide an "error" callback in the definition or global config to access all info');
      return;
    }

    this.definition.error({
      error: err,
      response: this._response
    });
  }

  _expect() {
    this._request = this.request.expect.apply(this.request, arguments);
    return this.request;
  }

}

module.exports = Request;
