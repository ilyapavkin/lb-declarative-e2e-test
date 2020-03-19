import Debug from 'debug';
import TestGen from 'declarative-test-structure-generator';
// import Request from './Request';
// import TestConfig from './TestConfig';
const Request = require('./Request'),
    TestConfig = require('./TestConfig');


const debug = Debug('lb-declarative-e2e-test');

class TestRunner {
    static run(app, config, testSuiteDefinition) {
        if (testSuiteDefinition === undefined) {
            debug('Running with default config');
            config = {};
            testSuiteDefinition = arguments[1];
        }

        config = TestConfig.make(config);
        testSuiteDefinition = TestRunner.generateTestSuiteDefinition(app, testSuiteDefinition, config);
        TestGen.run(testSuiteDefinition);
    }

    static generateTestSuiteDefinition(app, def = {}, config = {}) {
        if (Array.isArray(def)) {
            return def.map(t => TestRunner.generateTestDefinition(app, t, config));
        }

        return Object.keys(def)
            .reduce((res, key) => {
                const testSuiteDef = def[key];
                if (!testSuiteDef.tests) {
                    throw 'Invalid test definition';
                }

                res[key] = {
                    ...testSuiteDef,
                    tests: TestRunner.generateTestSuiteDefinition(app, testSuiteDef.tests, config)
                };
                return res;
            }, {});
    }

    static generateTestDefinition(app, def, config) {
        return {
            ...def,
            test: TestRunner.buildTest(app, def, config)
        };
    }

    static buildTest(app, def, config) {
        return () => {
            debug(`Test ${def.name}: started`);
            return Request.process(app, def, config);
        };
    }

}

module.exports = TestRunner;
