import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser } from "puppeteer";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let html: string | undefined;

  try {
    const body = await req.json();
    html = body?.html;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!html) {
    return NextResponse.json({ error: 'Missing HTML content' }, { status: 400 });
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set content and wait for network quiet
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Ensure webfonts and images are ready before rendering
    try {
      await page.evaluate(async () => {
        // Wait for webfonts
        // @ts-ignore
        await (document as any).fonts?.ready;

        // Wait for images
        const imgs = Array.from(document.images || []);
        await Promise.all(
          imgs.map(
            (img) =>
              img.complete ||
              new Promise((res) => {
                img.onload = img.onerror = () => res(true);
              })
          )
        );
      });
    } catch {
      // Ignore readiness errors; continue to PDF
    }

    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'attachment; filename=report.pdf');

    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Only POST requests allowed' }, { status: 405 });
}