This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Hume Emotion Demo

1. Copy `.env.local.example` to `.env.local` and set your **Hume API key**:

```bash
cp .env.local.example .env.local
# then edit .env.local
NEXT_PUBLIC_HUME_API_KEY=sk_...
```

2. Start the dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000` – allow camera permissions and observe live emotion predictions.

## Claude Chat

The homepage also includes a simple Claude chat box.

1. Ensure `CLAUDE_API_KEY` is set in your `.env.local` (as shown above).
2. (Optional) Specify `CLAUDE_MODEL` (e.g. `claude-3-haiku-20240307`). Defaults to Haiku if not set.
3. Type a prompt and press **Send** – the response will render below the box.
