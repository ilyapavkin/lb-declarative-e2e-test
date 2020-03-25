'use strict';

const TestRunner = require('./lib/TestRunner');

module.exports = (app, config, testSuiteDefinition) => {
    TestRunner.run(app, config, testSuiteDefinition);
};
