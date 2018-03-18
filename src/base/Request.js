'use strict';

const request = require('supertest');

class Request {

  constructor(app, definition = {}) {
    this.definition = definition;

    this._request = Request.buildRequest(app, definition);
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

  static buildRequest(app, definition) {
    const url = Request.getUrl(definition.url);

    let request;
    request = Request.getSuperTest()(app)[definition.verb](url);
    request = Request.applyHeaders(request, definition.headers);
    request = Request.applyBody(request, definition.body);

    return request;
  }

  static getUrl(url) {
    return typeof url === 'function' ? url() : url;
  }

  static applyHeaders(request, headers) {
    if (!headers) {
      return request;
    }

    Object.keys(headers).forEach(key => {
      request = request.set(key, headers[key]);
    });

    return request;
  }

  static applyBody(request, body) {
    if (!body) {
      return request;
    }

    return request.send(typeof body === 'function'
      ? body()
      : body
    );
  }

  static process(app, definition, config) {
    const authDef = definition.auth;

    if (!authDef) {
      return Request.processRequest(app, definition, config);
    }

    if (Array.isArray(definition.auth)) {
      return Promise.all(
        definition.auth.map(auth =>
          Request.processAuthenticatedRequest(app, {
            ...definition,
            auth
          }, config))
      );
    }

    return Request.processAuthenticatedRequest(app, definition, config);
  }

  static processAuthenticatedRequest(app, definition, config) {
    return Request.sendAuth(app, definition.auth, config)
      .then(tokenId => {
        return Request.processRequest(app, {
          ...definition,
          headers: {
            ...definition.headers,
            Authorization: tokenId
          }
        }, config);
      });
  }

  static processRequest(app, definition, config) {
    return new Request(
      app,
      Object.assign({}, {
        headers: config.headers,
        baseUrl: config.baseUrl
      }, definition)
    ).test();
  }

  static sendAuth(app, auth, config) {
    if (typeof auth === 'string') {
      return Promise.resolve(auth);
    }

    return Request.getSuperTest()(app)
      .post(config.auth.url)
      .send(auth)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .then(res => {
        if (res.body.error) {
          throw res.body.error;
        }

        return res.body.id;
      });
  }

  test() {
    const expected = this.expected;

    if (typeof expected !== 'object' || (expected.body === undefined && expected.header === undefined)) {
      this._expect(expected);

      return this.request;
    }

    if (this.expected.header) {
      Object.keys(this.expected.header).forEach(key => {
        this._expect(key, this.expected.header[key]);
      });
    }

    if (this.expected.body) {
      this._expect(this.expected.body);
    }

    return this.request;
  }

  _expect() {
    this._request = this._request.expect.apply(this.request, arguments);
  }

}

module.exports = Request;