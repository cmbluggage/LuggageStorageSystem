import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/ui/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How we collect, use and protect your personal information when you book luggage storage.',
  alternates: { canonical: '/privacy' },
};

const CONTACT_EMAIL = 'bookings@storeluggagecolomboairport.com';

type Section = { title: string; paras?: string[]; list?: string[]; after?: string[] };

const SECTIONS: Section[] = [
  {
    title: 'Who We Are',
    paras: [
      'This website is operated by Luggage Storage Colombo (“we”, “us”), a luggage storage service based in Katunayake, Sri Lanka, with drop-off points at Hotel Thilon and Colombo (CMB) Airport.',
      'This policy explains what personal information we collect when you use our website or storage service, why we collect it, and your rights over it. We handle personal data in line with Sri Lanka’s Personal Data Protection Act No. 9 of 2022 and, where it applies to you, the EU/UK General Data Protection Regulation.',
    ],
  },
  {
    title: 'Information We Collect',
    paras: ['When you make a booking, we collect:'],
    list: [
      'Your first and last name',
      'Your email address (used to verify your booking and send you updates)',
      'Your phone number',
      'Your passport number, for identification when you drop off and collect luggage',
      'Your arrival flight number, if you provide it',
      'Any notes you add to your booking',
      'Booking details: locations, dates and times, number and type of bags, and whether you chose luggage insurance',
      'Payment records: the amount, method (cash or card) and status of each payment',
    ],
    after: [
      'When you visit the website, we also process your IP address for security purposes: to limit repeated requests and to protect our booking forms from automated abuse.',
      'At drop-off, our staff may also record a description or photographs of your luggage, as described in our Terms & Conditions.',
    ],
  },
  {
    title: 'Card Payments',
    paras: [
      'Card payments are processed by Stripe. Your card number, expiry date and security code are entered directly on Stripe’s secure payment page and are never sent to or stored on our systems. We only receive confirmation of whether a payment succeeded and its amount.',
    ],
  },
  {
    title: 'How We Use Your Information',
    list: [
      'To create and manage your booking and store your luggage',
      'To verify your identity when you drop off and collect luggage',
      'To send you booking confirmations, verification codes, payment receipts and status updates by email',
      'To contact you about your booking, for example if you are late or your flight is delayed',
      'To take payments and keep accurate financial records',
      'To protect our website and service against fraud and abuse',
      'To meet our legal and accounting obligations',
    ],
    after: ['We do not sell your personal information, and we do not use it for advertising.'],
  },
  {
    title: 'Who We Share It With',
    paras: ['We share your information only with service providers who help us run the service, and only as far as they need it:'],
    list: [
      'Supabase: secure database hosting for bookings and customer records',
      'Vercel: website hosting',
      'Stripe: card payment processing',
      'Resend and Hostinger: sending booking and verification emails',
      'Cloudflare: bot protection on our booking forms',
    ],
    after: [
      'Some of these providers may process data outside Sri Lanka. We rely on providers that apply recognised security and data protection safeguards.',
      'We may also disclose information where required by law, or to airport, security or law enforcement authorities where legally necessary.',
    ],
  },
  {
    title: 'Cookies',
    paras: [
      'We do not use advertising or analytics cookies, and we do not track you across other websites. Our website only uses storage that is strictly necessary for it to work, such as security checks on our booking forms and login sessions for our own staff.',
    ],
  },
  {
    title: 'How Long We Keep It',
    paras: [
      'We keep booking and customer information for as long as needed to provide the service, resolve any claims or disputes, and meet our legal, tax and accounting obligations. After that, it is deleted or anonymised.',
      'Email verification codes are never stored in readable form and expire after 10 minutes.',
    ],
  },
  {
    title: 'How We Protect It',
    paras: [
      'Your information is stored in a secured database that is not publicly accessible. Access is limited to our authorised staff through password-protected accounts, and changes to bookings are recorded in an audit log. All traffic to our website is encrypted using HTTPS.',
    ],
  },
  {
    title: 'Your Rights',
    paras: ['Subject to applicable law, you can ask us to:'],
    list: [
      'Give you a copy of the personal information we hold about you',
      'Correct information that is inaccurate or incomplete',
      'Delete your information, where we are not required to keep it',
      'Stop or restrict certain uses of your information',
    ],
    after: [
      `To make a request, email us at ${CONTACT_EMAIL}. We may need to verify your identity before acting on it. You also have the right to complain to the Data Protection Authority of Sri Lanka or your local data protection authority.`,
    ],
  },
  {
    title: 'Children',
    paras: ['Our booking service is intended for adults. We do not knowingly collect personal information from children under 18 without the involvement of a parent or guardian.'],
  },
  {
    title: 'Changes to This Policy',
    paras: ['We may update this policy from time to time. The latest version will always be available on this page.'],
  },
  {
    title: 'Contact Us',
    paras: [`For any questions about this policy or your personal information, email us at ${CONTACT_EMAIL}.`],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="max-w-[800px] mx-auto px-6 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-extrabold text-[#1C130E] tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-[15px] text-[#5f5f5f]">
          How we collect, use and protect your information. See also our{' '}
          <Link href="/terms" className="text-orange-600 font-bold underline">Terms &amp; Conditions</Link>.
        </p>

        <ol className="mt-10 space-y-8">
          {SECTIONS.map((s, i) => (
            <li key={s.title} id={`section-${i + 1}`} className="scroll-mt-24">
              <h2 className="text-lg font-extrabold text-[#1C130E]">
                <span className="text-orange-600 mr-2">{i + 1}.</span>{s.title}
              </h2>
              <div className="mt-3 space-y-3">
                {s.paras?.map((p) => <p key={p} className="text-[15px] leading-relaxed text-[#5f5f5f]">{p}</p>)}
                {s.list && (
                  <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#5f5f5f] leading-relaxed marker:text-orange-600">
                    {s.list.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {s.after?.map((p) => <p key={p} className="text-[15px] leading-relaxed text-[#5f5f5f]">{p}</p>)}
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
