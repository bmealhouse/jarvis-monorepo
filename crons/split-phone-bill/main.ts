#!/usr/bin/env -S deno run --allow-all
import "https://deno.land/std@0.149.0/dotenv/load.ts";
import { ensureFile, EOL } from "https://deno.land/std@0.149.0/fs/mod.ts";
import puppeteer from "https://deno.land/x/puppeteer@14.1.1/mod.ts";
import mjml2html from "https://esm.sh/mjml-browser@4.13.0";

// Read last entry from from log file.
await ensureFile("./cron.log");
const logfile = await Deno.readTextFile("./cron.log");
const [lastLogEntry] = logfile.split(EOL.LF).filter(Boolean).reverse();

if (lastLogEntry) {
  const [lastExecutionTimestamp] = lastLogEntry.split(" :: ");

  // Determine the last billing date.
  const billingDate = 24;
  const d = new Date();
  const [day, month, year] = [d.getDate(), d.getMonth(), d.getFullYear()];
  const lastBillingDate = new Date(
    year,
    day >= billingDate ? month : month - 1,
    billingDate
  );

  // Exit the program if we've already processed since the last billing date.
  if (new Date(lastExecutionTimestamp) > lastBillingDate) {
    await Deno.writeTextFile(
      "./cron.log",
      [
        ...logfile.split(EOL.LF).filter(Boolean),
        `${new Date().toISOString()} :: NOOP`,
      ].join(EOL.LF)
    );

    Deno.exit();
  }
}

try {
  let billLandingResponse: BillLandingResponse | undefined;
  let billLandingMiddleSectionResponse: BillLandingResponse | undefined;

  try {
    await Deno.stat("./bill_landing.json");

    billLandingResponse = JSON.parse(
      await Deno.readTextFile("./bill_landing.json")
    );
    // deno-lint-ignore no-empty
  } catch {}

  try {
    await Deno.stat("./bill_landing_middlesection.json");

    billLandingMiddleSectionResponse = JSON.parse(
      await Deno.readTextFile("./bill_landing_middlesection.json")
    );
    // deno-lint-ignore no-empty
  } catch {}

  if (!billLandingResponse || !billLandingMiddleSectionResponse) {
    // Login to Verizon's website and record billing network requests.
    const browser = await puppeteer.launch({
      headless: false,
      devtools: true,
    });

    const page = await browser.newPage();
    await page.goto("https://login.verizonwireless.com/vzauth/UI/Login", {
      waitUntil: "networkidle0",
    });

    await page.waitForSelector("#login-form");

    // Watch for network requests to record.
    page.on("requestfinished", async (request) => {
      const url = request.url();
      if (url.includes("/bill_landing")) {
        const response = request.response();
        if (response?.ok()) {
          const json = await response.json();
          if (url.includes("/bill_landing_middlesection")) {
            billLandingMiddleSectionResponse = json;
          } else if (url.includes("/bill_landing")) {
            billLandingResponse = json;
          }
        }
      }
    });

    console.log("Logging in to verizonwireless.com…");
    await page.type("#IDToken1", Deno.env.get("VERIZON_USERNAME") ?? "");
    await page.type("#IDToken2", Deno.env.get("VERIZON_PASSWORD") ?? "");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#login-submit"),
    ]);

    try {
      await page.waitForSelector("#challengequestion");

      console.log("Answering security question…");
      await page.type("#IDToken1", Deno.env.get("VERIZON_SECRET_ANSWER") ?? "");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0" }),
        page.click("#otherButton"),
      ]);
      // deno-lint-ignore no-empty
    } catch {}

    console.log("Waiting for successful login…");
    await page.waitForSelector("#welcome_message");

    console.log("Viewing bill…");
    await page.goto(
      "https://www.verizon.com/digital/nsa/secure/ui/bill/viewbill/",
      {
        waitUntil: "networkidle0",
      }
    );

    const maxDurationMs = 5000;
    const waitDurationMs = 100;

    let totalDuration = 0;
    while (
      totalDuration <= maxDurationMs &&
      (!billLandingResponse || !billLandingMiddleSectionResponse)
    ) {
      totalDuration += waitDurationMs;
      await page.waitForTimeout(waitDurationMs);
    }

    // Write recorded JSON responses to disk.
    if (billLandingResponse) {
      await Deno.writeTextFile(
        "./bill_landing.json",
        JSON.stringify(billLandingResponse, undefined, 2)
      );
    }

    if (billLandingMiddleSectionResponse) {
      await Deno.writeTextFile(
        "./bill_landing_middlesection.json",
        JSON.stringify(billLandingMiddleSectionResponse, undefined, 2)
      );
    }

    await browser.close();

    if (!billLandingResponse || !billLandingMiddleSectionResponse) {
      throw new Error("No billing data received.");
    }
  }

  let emailContext: EmailContext = {
    headerText: "",
    billMessage: "",
    totalBillCost: 0,
    chargesByLine: {},
    chargesByFamily: {},
  };

  {
    console.log("Parsing bill landing data…");
    const {
      body: { sections },
    } = billLandingResponse;

    const viewBillMainSection = sections.find(
      (section) => section.sectionType === "viewBillMainSection"
    );

    const viewBillTopSection = viewBillMainSection?.sections.find(
      (section) => section.sectionType === "viewBillTopSection"
    );

    const { items } =
      viewBillTopSection?.contents.find(
        (content) => content.contentType === "viewBillTopSection"
      ) ?? {};

    const headerText = items?.find((item) => item.itemKey === "headerText");
    const billMessage = items?.find((item) => item.itemKey === "billMessage");

    emailContext = {
      ...emailContext,
      headerText: headerText?.itemValue.trim() ?? "",
      billMessage: billMessage?.itemValue.trim() ?? "",
    };
  }

  {
    console.log("Parsing bill landing middle section data…");
    const {
      body: { sections },
    } = billLandingMiddleSectionResponse;

    const viewBillMiddleSection = sections.find(
      (section) => section.sectionType === "viewBillMiddleSection"
    );

    const estimatedChargesBottomSection = viewBillMiddleSection?.sections.find(
      (section) => section.sectionType === "estimatedChargesBottomSection"
    );

    const { items } =
      estimatedChargesBottomSection?.contents.find(
        (content) => content.contentType === "footer"
      ) ?? {};

    const currentBillCost = items?.find(
      (item) => item.itemKey === "currentBillCost"
    );

    const totalBillCost = cents(currentBillCost?.itemValue);

    let planAmount = 0;
    const chargesByLine: EmailContext["chargesByLine"] = {};

    const { data } =
      viewBillMiddleSection?.sections.find(
        (section) => section.sectionType === "viewBillChargesSection"
      ) ?? {};

    for (const groupCharge of data?.groupCharges ?? []) {
      for (const key of groupCharge.dataKey) {
        const { isLineLevel = false, currentBillCost = "$0.00" } =
          data?.[key] ?? {};

        if (!isLineLevel) {
          planAmount = cents(currentBillCost);
          continue;
        }

        if (!chargesByLine[groupCharge.mtn]) {
          chargesByLine[groupCharge.mtn] = {
            nickname: groupCharge.mtnNickName,
            phoneNumber: groupCharge.mtn,
            formattedPhoneNumber: groupCharge.subHeaderText.replaceAll(
              ".",
              "-"
            ),
            amount: 0,
          };
        }

        const chargesForLine = chargesByLine[groupCharge.mtn];
        chargesForLine.amount += cents(currentBillCost);
      }
    }

    const totalLines = Object.keys(chargesByLine).length;
    const planAmountPerLine = Math.ceil(planAmount / totalLines);

    let total = 0;
    for (const line of Object.values(chargesByLine)) {
      line.amount += planAmountPerLine;
      total += line.amount;
    }

    const leftOverCents = total - totalBillCost;

    const discountedLine =
      chargesByLine[Deno.env.get("VERIZON_DISCOUNTED_LINE") ?? ""];
    discountedLine.amount -= leftOverCents;

    type FamilyConfig = {
      family: string;
      phoneNumbers: string[];
    };

    const familyConfig: FamilyConfig[] = JSON.parse(
      Deno.env.get("VERIZON_FAMILY_CONFIG") ?? "[]"
    );

    const chargesByFamily: EmailContext["chargesByFamily"] = {};

    for (const { family, phoneNumbers } of familyConfig) {
      let amount = 0;

      for (const line of Object.values(chargesByLine)) {
        if (phoneNumbers.includes(line.phoneNumber)) {
          amount += line.amount;
        }
      }

      chargesByFamily[family] = {
        family,
        phoneNumbers,
        amount,
      };
    }

    emailContext = {
      ...emailContext,
      totalBillCost,
      chargesByLine,
      chargesByFamily,
    };
  }

  {
    console.log("Fetching quote of the day…");

    const {
      contents: {
        quotes: [quoteOfTheDay],
      },
    } = await fetch(
      "http://quotes.rest/qod.json?category=inspire"
    ).then<QuoteOfTheDayResponse>((response) => response.json());

    emailContext = {
      ...emailContext,
      quoteOfTheDay,
    };
  }

  {
    console.log("Generating and sending email…");

    const {
      headerText,
      billMessage,
      totalBillCost,
      chargesByLine,
      chargesByFamily,
      quoteOfTheDay,
    } = emailContext;

    const chargesByLineHtml = Object.values(chargesByLine).map(
      (item, index) => `
<tr${
        index < Object.values(chargesByLine).length - 1
          ? ' style="border-bottom:1px solid #ecedee; text-align:left; padding:15px 0;"'
          : ""
      }>
  <td style="padding: 0 15px 0 0; font-weight:bold;">${
    item.nickname.split(" ")[0]
  }</td>
  <td style="padding: 0 15px;">${item.formattedPhoneNumber}</td>
  <td style="padding: 0 0 0 15px;">${currency(item.amount)}</td>
</tr>`
    );

    const chargesByFamilyHtml = Object.values(chargesByFamily).map(
      (item, index) => `
<tr ${
        index < Object.values(chargesByFamily).length - 1
          ? ' style="border-bottom:1px solid #ecedee; text-align:left; padding:15px 0;"'
          : ""
      }>
  <td style="padding: 0 15px 0 0; font-weight:bold;">${item.family}</td>
  <td style="padding: 0 0 0 15px;">${currency(item.amount)}</td>
</tr>`
    );

    const mjmlTemplate = `
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-family="Helvetica, Arial" font-size="36px" font-weight="bold">Verizon Bill</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-family="Helvetica, Arial" font-style="italic" color="#666">&ldquo;${
          quoteOfTheDay?.quote
        }&rdquo;</mj-text>
        <mj-text font-family="Helvetica, Arial" padding-top="0px">&mdash;${
          quoteOfTheDay?.author
        }</mj-text>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-divider border-color="#d52b1e"></mj-divider>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text font-family="Helvetica, Arial" font-size="22px" font-weight="bold">${headerText} ${currency(
      totalBillCost
    )}</mj-text>
        <mj-text font-family="Helvetica, Arial" padding-top="0px">${billMessage}</mj-text>
        <mj-button font-family="Helvetica, Arial" background-color="#d52b1e" color="#fff" align="left" href="https://m.vzw.com/m/hhr7?EMHID=47160068f6075255caa8edd8624a76c9&cmp=EMC-OMT-BILLREADY&vt=BR-CTA-ViewPayBill">View and pay your bill</mj-button>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text font-family="Helvetica, Arial" font-size="18px" font-weight="bold">Charges per line.</mj-text>
        <mj-table font-family="Helvetica, Arial">
          ${chargesByLineHtml.join("")}
        </mj-table>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text font-family="Helvetica, Arial" font-size="18px" font-weight="bold">Charges per family.</mj-text>
        <mj-table font-family="Helvetica, Arial">
          ${chargesByFamilyHtml.join("")}
        </mj-table>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

    const { html } = mjml2html(mjmlTemplate, {
      minify: true,
      validationLevel: "strict",
    });

    const sendEmailRequest: SendGridEmailRequest = {
      personalizations: [
        {
          // to: [{ email: "bmealhouse@gmail.com" }],
          to:
            Deno.env
              .get("SENDGRID_TO")
              ?.split(",")
              .map((email) => ({
                email,
              })) ?? [],
        },
      ],
      from: {
        email: Deno.env.get("SENDGRID_FROM") ?? "",
      },
      subject: "Verizon Bill",
      content: [
        {
          type: "text/html",
          value: html,
        },
      ],
    };

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SENDGRID_API_KEY") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendEmailRequest),
    });
  }
} catch (error) {
  await Deno.writeTextFile(
    "./cron.log",
    [
      ...logfile.split(EOL.LF).filter(Boolean),
      `${new Date().toISOString()} :: ERROR :: ${error}`,
    ].join(EOL.LF)
  );
}

await Deno.writeTextFile(
  "./cron.log",
  [
    ...logfile.split(EOL.LF).filter(Boolean),
    `${new Date().toISOString()} :: EMAIL SENT`,
  ].join(EOL.LF)
);

await Deno.remove("./bill_landing.json");
await Deno.remove("./bill_landing_middlesection.json");

Deno.exit();

function cents(value?: string) {
  if (!value) {
    return 0;
  }

  const decimal = Number(value.replace("$", ""));
  if (Number.isNaN(decimal)) {
    throw new Error(`Could not parse: "${value}"`);
  }

  return decimal * 100;
}

function currency(value: number) {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

type BillLandingResponse = {
  body: {
    sections: MainSection[];
  };
};

type MainSection = {
  sectionType: string;
  sections: ContentSection[];
};

type ContentSection = {
  sectionType: string;
  contents: Content[];
  data: Record<string, Data> & {
    groupCharges: GroupCharge[];
  };
};

type Content = {
  contentType?: string;
  items: ContentItem[];
};

type ContentItem = {
  itemKey: string;
  itemValue: string;
};

type Data = {
  currentBillCost: string;
  isLineLevel: boolean;
};

type GroupCharge = {
  subHeaderText: string;
  dataKey: string[];
  mtnNickName: string;
  mtn: string;
};

type EmailContext = {
  headerText: string;
  billMessage: string;
  totalBillCost: number;
  chargesByLine: Record<
    string,
    {
      nickname: string;
      phoneNumber: string;
      formattedPhoneNumber: string;
      amount: number;
    }
  >;
  chargesByFamily: Record<
    string,
    {
      family: string;
      phoneNumbers: string[];
      amount: number;
    }
  >;
  quoteOfTheDay?: Quote;
};

type QuoteOfTheDayResponse = {
  contents: {
    quotes: Quote[];
  };
};

type Quote = {
  quote: string;
  author: string;
};

type SendGridEmailRequest = {
  personalizations: Array<{
    to: SendGridContact[];
  }>;
  from: SendGridContact;
  subject: string;
  content: SendGridContent[];
};

type SendGridContact = {
  email: string;
  name?: string;
};

type SendGridContent = {
  type: "text/html";
  value: string;
};
