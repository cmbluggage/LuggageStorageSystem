import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/ui/SiteHeader';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Terms & Conditions for luggage storage at Hotel Thilon and Colombo Airport.',
  alternates: { canonical: '/terms' },
};

type Section = { title: string; paras?: string[]; list?: string[]; after?: string[] };

const SECTIONS: Section[] = [
  {
    title: 'Acceptance of Terms',
    paras: ['By leaving luggage or personal belongings with us for storage, the customer confirms that they have read, understood and agreed to these Terms & Conditions.'],
  },
  {
    title: 'Storage Period',
    list: [
      'Luggage will be stored only for the period agreed at the time of booking.',
      'Customers must collect their luggage on or before the agreed collection date and time.',
      'Additional storage charges may apply if luggage is collected late.',
      'If luggage remains uncollected for an extended period, we may contact the customer using the contact details provided at the time of booking.',
    ],
  },
  {
    title: 'Customer Responsibility',
    paras: [
      'The customer is responsible for ensuring that all information provided during check-in is accurate.',
      'Customers should inform us of any special characteristics, damage or existing defects to their luggage before storage.',
    ],
  },
  {
    title: 'Prohibited Items',
    paras: ['The following items must not be stored:'],
    list: [
      'Illegal drugs or substances',
      'Weapons, firearms or ammunition',
      'Explosives or flammable materials',
      'Dangerous or hazardous chemicals',
      'Perishable food or items likely to spoil',
      'Live animals',
      'Items prohibited by Sri Lankan law',
      'Any other item that may pose a risk to people, property or other stored luggage',
    ],
    after: ['We reserve the right to refuse or terminate storage of any item that we reasonably believe may be prohibited, dangerous or unsuitable for storage.'],
  },
  {
    title: 'Valuable Items',
    paras: [
      '**Customers are strongly advised not to place cash, jewellery, passports, electronic devices, important documents or other high-value items inside stored luggage.**',
      'The customer remains responsible for valuables placed inside their luggage.',
    ],
  },
  {
    title: 'Identification & Collection',
    paras: [
      'For security purposes, customers may be required to provide reasonable identification or booking information when collecting their luggage.',
      'Luggage will normally be released only to the customer or an authorised person nominated by the customer.',
      'The customer may be required to present their storage receipt, booking reference or luggage identification tag before collection.',
    ],
  },
  {
    title: 'Luggage Identification',
    paras: [
      'Each stored item may be assigned a unique luggage tag, receipt number or booking reference.',
      'Customers should keep their luggage receipt/tag or booking details until collection.',
      'The storage provider may record basic information such as the number of bags, luggage description, photographs and storage reference number for security and identification purposes.',
    ],
  },
  {
    title: 'Existing Damage',
    paras: [
      'The customer acknowledges that luggage may have existing scratches, dents, broken wheels, damaged handles, zippers or other signs of wear.',
      'We are not responsible for damage that existed before the luggage was accepted for storage.',
    ],
  },
  {
    title: 'Loss or Damage',
    paras: ['We will take reasonable care of stored luggage. However, to the extent permitted by applicable law, we are not responsible for loss or damage resulting from:'],
    list: [
      'Normal wear and tear',
      'Pre-existing damage',
      'Items improperly packed by the customer',
      'Fragile items inside luggage',
      'Prohibited or undeclared items',
      'Events beyond our reasonable control',
    ],
    after: ['Any claim for loss or damage should be reported as soon as the luggage is collected.'],
  },
  {
    title: 'Payment & Refunds',
    list: [
      'Storage fees must be paid according to the agreed booking terms.',
      'Additional charges may apply for extended storage, late collection, special handling or other services agreed with the customer.',
      'Refunds, if applicable, will be considered according to the business’s cancellation and refund policy.',
    ],
  },
  {
    title: 'Airport Collection & Delivery',
    paras: [
      'Where airport luggage collection or delivery is offered as an additional service, separate charges may apply.',
      'The customer must provide accurate flight, contact and collection/delivery information. The business is not responsible for delays caused by incorrect information, flight changes, airport restrictions, traffic or circumstances outside its reasonable control.',
    ],
  },
  {
    title: 'Unclaimed Luggage',
    paras: [
      'If luggage is not collected within the agreed storage period and the customer cannot be contacted after reasonable attempts, the business may take appropriate steps to deal with the unclaimed luggage in accordance with applicable law.',
      'Any costs associated with extended storage, handling or disposal may be charged to the customer where legally permitted.',
    ],
  },
  {
    title: 'Personal Information',
    paras: ['Customer information collected for booking, identification, payment and luggage management purposes will be handled in accordance with applicable privacy laws.'],
  },
  {
    title: 'Limitation of Liability',
    paras: [
      'To the maximum extent permitted by applicable law, the business’s liability for loss or damage to luggage or its contents is limited to the amount permitted under applicable law and any agreed storage liability terms.',
      'Nothing in these Terms & Conditions excludes or limits any rights or guarantees that cannot legally be excluded or limited.',
    ],
  },
  {
    title: 'Force Majeure',
    paras: ['We are not responsible for failure or delay in providing storage services caused by circumstances beyond our reasonable control, including natural disasters, fire, flood, government restrictions, security incidents, power failures or other unforeseen events.'],
  },
  {
    title: 'Customer Declaration',
    paras: ['By booking or using our luggage storage service, the customer confirms that:'],
    list: [
      'The luggage belongs to them or they are authorised to leave it for storage.',
      'The luggage does not contain prohibited or dangerous items.',
      'The information provided to us is accurate.',
      'They have read and accepted these Terms & Conditions.',
    ],
  },
];

function Para({ text }: { text: string }) {
  const bold = text.startsWith('**') && text.endsWith('**');
  return (
    <p className={`text-[15px] leading-relaxed ${bold ? 'font-bold text-[#1C130E]' : 'text-[#5f5f5f]'}`}>
      {bold ? text.slice(2, -2) : text}
    </p>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="max-w-[800px] mx-auto px-6 py-12 md:py-16">
        <h1 className="text-3xl md:text-4xl font-extrabold text-[#1C130E] tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-3 text-[15px] text-[#5f5f5f]">
          Please read these terms before booking. Questions? <Link href="/my-bookings" className="text-orange-600 font-bold underline">Contact us</Link>.
        </p>

        <ol className="mt-10 space-y-8">
          {SECTIONS.map((s, i) => (
            <li key={s.title} id={`section-${i + 1}`} className="scroll-mt-24">
              <h2 className="text-lg font-extrabold text-[#1C130E]">
                <span className="text-orange-600 mr-2">{i + 1}.</span>{s.title}
              </h2>
              <div className="mt-3 space-y-3">
                {s.paras?.map((p) => <Para key={p} text={p} />)}
                {s.list && (
                  <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#5f5f5f] leading-relaxed marker:text-orange-600">
                    {s.list.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {s.after?.map((p) => <Para key={p} text={p} />)}
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
