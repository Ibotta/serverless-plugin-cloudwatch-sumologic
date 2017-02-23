'use strict';

const path = require('path');
const fs = require('fs');
const _ = require('lodash');

class Plugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');

        this.hooks = {
            'deploy:compileEvents': this.deployCompileEvents.bind(this),
        };
    }

    deployCompileEvents() {
        if(this.serverless.service.provider.environment.DEPLOY_STAGE != "prod"){
          return;
        }

        this.serverless.cli.log('Generating subscription filters');
        let filterPattern = !!this.serverless.service.custom.shipLogs.filterPattern ? this.serverless.service.custom.shipLogs.filterPattern : "[timestamp=*Z, request_id=\"*-*\", event]";

        const filterBaseStatement = {
            Type: "AWS::Logs::SubscriptionFilter",
            Properties: {
                DestinationArn: this.serverless.service.custom.shipLogs.lambdaArn,
                FilterPattern: filterPattern
            },
            DependsOn: ["cloudwatchLogsLambdaPermission"]
        };

        Object.freeze(filterBaseStatement); // Make it immutable

        const principal = `logs.${this.serverless.service.provider.region}.amazonaws.com`;

        let cloudwatchLogsLambdaPermission = {
            Type: "AWS::Lambda::Permission",
            Properties: {
                FunctionName: this.serverless.service.custom.shipLogs.lambdaArn,
                Action: "lambda:InvokeFunction",
                Principal: principal
            }
        };

        this.serverless.service.provider.compiledCloudFormationTemplate.Resources.cloudwatchLogsLambdaPermission = cloudwatchLogsLambdaPermission;

        this.serverless.service.getAllFunctions().forEach((functionName) => {
            if (functionName !== 'sumologicShipping') {
                const functionObj = this.serverless.service.getFunction(functionName);

                // We will be able to do this soon
                // const logGroupLogicalId = this.provider.naming.getLogGroupLogicalId(functionName);

                const logGroupLogicalId = getLogGroupLogicalId(functionName)

                let filterStatement = filterBaseStatement;

                filterStatement.Properties.LogGroupName = `/aws/lambda/${functionObj.name}`;

                let filterStatementName = functionName + 'SumoLogicSubscriptionFilter';

                filterStatement.DependsOn.push(logGroupLogicalId);

                let newFilterStatement = {
                    [`${filterStatementName}`]: filterStatement
                };

                _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, newFilterStatement);
            }
        });
    }

}

module.exports = Plugin;

// Remove after 1.1.1 release
function normalizeName(name) {
    return `${_.upperFirst(name)}`;
}

function getNormalizedFunctionName(functionName) {
    return normalizeName(functionName
        .replace(/-/g, 'Dash')
        .replace(/_/g, 'Underscore'));
}

function getLogGroupLogicalId(functionName) {
    return `${getNormalizedFunctionName(functionName)}LogGroup`;
}
