#!/usr/bin/env node
import path from "path";
import { Construct } from "constructs";
import { App, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
// import * as events from "aws-cdk-lib/aws-events";
// import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

class VerizonSplitBillStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const { username, password } = secretsmanager.Secret.fromSecretNameV2(
      this,
      "vzw-credentials-id",
      "vzw-credentials"
    ).secretValue.toJSON();

    const { discountedMtn, families } = secretsmanager.Secret.fromSecretNameV2(
      this,
      "vzw-config-id",
      "vzw-config"
    ).secretValue.toJSON();

    const bucket = new s3.Bucket(this, "error-screenshots", {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const layer = new lambda.LayerVersion(this, "puppeteer-layer", {
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      code: lambda.Code.fromAsset("layers/puppeteer"),
      description: "Lambda layer including Chromium Binary",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const handler = new NodejsFunction(this, "lambda", {
      memorySize: 1024,
      timeout: Duration.seconds(60),
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "handler",
      entry: path.join(__dirname, "./src/index.ts"),
      layers: [layer],
      retryAttempts: 0,
      bundling: {
        minify: false,
        externalModules: ["chrome-aws-lambda", "puppeteer-core"],
      },
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
        VZW_PASSWORD: password,
        VZW_USERNAME: username,
        VZW_DISCOUNTED_MTN: discountedMtn,
        VZW_FAMILIES_CONFIG: families,
      },
    });

    bucket.grantWrite(handler);

    // const event = new events.Rule(this, "schedule-rule", {
    //   schedule: events.Schedule.cron({ day: "27", hour: "14" }),
    // });

    // event.addTarget(new targets.LambdaFunction(handler));
  }
}

const app = new App();
new VerizonSplitBillStack(app, "verizon-split-bill-stack", {
  stackName: "verizon-split-bill-stack",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
