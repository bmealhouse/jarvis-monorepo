import dotenv from "dotenv";
dotenv.config();

import { handler } from "./src";

main();
async function main() {
  await handler(
    {
      id: "",
      version: "",
      account: "",
      time: "",
      region: "",
      resources: [],
      source: "",
      "detail-type": "Scheduled Event",
      detail: "",
    },
    {
      callbackWaitsForEmptyEventLoop: false,
      functionName: "",
      functionVersion: "",
      invokedFunctionArn: "",
      memoryLimitInMB: "",
      awsRequestId: "",
      logGroupName: "",
      logStreamName: "",
      getRemainingTimeInMillis: () => 0,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    },
    () => {}
  );
}
