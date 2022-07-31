# split-phone-bill

> Splits my phone bill between family members.

## Usage

### Install puppeteer

```sh
PUPPETEER_PRODUCT=chrome deno run --allow-all --unstable https://deno.land/x/puppeteer@14.1.1/install.ts
```

### Compile

```sh
deno compile --allow-all --output ./cron main.ts
```

### Schedule cron (at every 30th minute)

```sh
crontab -e
```

```
*/30 * * * * cd ~/dev/jarvis-monorepo/crons/split-phone-bill && ./cron
```
