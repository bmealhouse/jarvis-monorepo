import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ScheduledHandler } from "aws-lambda";
import chromium from "chrome-aws-lambda";
import { Browser, Page } from "puppeteer-core";

const client = new S3Client({
  region: process.env.AWS_REGION,
});

export const handler: ScheduledHandler = async () => {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.goto("https://login.verizonwireless.com/vzauth/UI/Login");
    await page.waitForSelector("#login-form");

    console.log("Logging in to verizonwireless.com…");
    await page.type("#IDToken1", process.env.VZW_USERNAME!);
    await page.type("#IDToken2", process.env.VZW_PASSWORD!);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#login-submit"),
    ]);

    try {
      await page.waitForSelector("#login-submit");

      console.log("Verifying login information…");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0" }),
        page.click("#login-submit"),
      ]);
    } catch {}

    // try {
    //   await page.waitForSelector("#sqaFlow");

    //   console.log("Entering verification code…");
    //   await Promise.all([
    //     page.waitForNavigation({ waitUntil: "networkidle0" }),
    //     page.click("#sqaFlow"),
    //   ]);

    //   // console.log("Entering verification code…");
    //   // spinVal
    //   // await Promise.all([
    //   //   page.waitForNavigation({ waitUntil: "networkidle0" }),
    //   //   page.click("#showSpinbutton"),
    //   // ]);
    // } catch {}

    console.log("Waiting for successful login…");
    await page.waitForSelector("#welcome_message");

    // throw new Error("testError");
  } catch (error) {
    if (page === null) {
      console.log("A processing error occurred:", error);
      return;
    }

    const errorScreenshot = await page.screenshot();

    const timestamp = Date.now();
    const isoDateString = new Date(timestamp).toISOString().slice(0, 10);
    const key = `${isoDateString}_${timestamp}.png`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: errorScreenshot,
    });

    try {
      await client.send(command);
      const AWSS3_BASE_URL =
        "https://s3.console.aws.amazon.com/s3/object/verizon-split-bill-stack-errorscreenshotsb4a1e4b8-2u8psb1d9ooh?region=us-east-2&prefix=";
      console.log(
        `A puppeteer error occurred. See screenshot: ${AWSS3_BASE_URL}${key}`,
        error
      );
    } catch (putError) {
      console.log(error);
      console.log(putError);
    }
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};
