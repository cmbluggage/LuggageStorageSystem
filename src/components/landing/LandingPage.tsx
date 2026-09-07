'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plane, ShieldCheck, Wallet, Lock, CalendarClock, Clock, MapPinned, PlaneTakeoff, CreditCard, Play, MapPin } from 'lucide-react';
import type { ItemTier } from '@/components/booking/ItemSelector';
import { DEFAULT_SETTINGS, type PublicSettings } from '@/lib/settings';
import { SiteHeader } from '@/components/ui/SiteHeader';
import { notify } from '@/lib/toast';

const TIER_IMAGES = ['/landing/item-small.png', '/landing/item-medium.png', '/landing/item-large.png', '/landing/item-odd.png'];

const FAQ_ITEMS = [
  {
    q: 'Where can I drop off and collect my luggage?',
    a: 'You can drop off and collect at either of our two locations: our counter just outside Bandaranaike International Airport, or Hotel Thilon, a 5-minute drive away. Pick whichever is closer to your plans when you book.',
  },
  {
    q: 'Do you offer airport pickup and delivery?',
    a: 'Yes. We can meet you at Arrivals or bring your bags to Departures in time for your flight. Airport pickup and delivery is available for a small additional fee and must be arranged in advance.',
  },
  {
    q: 'What if my travel plans change?',
    a: 'No problem — cancellation is free and there is no prepayment required. Message us on WhatsApp any time before your booked drop-off to change your dates or location.',
  },
  {
    q: 'How does payment and insurance work?',
    a: 'Pay conveniently using foreign or local currency, or by card. Insurance is optional and calculated per item — you can choose to add it during checkout for extra peace of mind.',
  },
  {
    q: 'What items can I store?',
    a: 'Anything from a daypack to a surfboard: backpacks, suitcases, duffel bags, bicycles, golf bags and other odd-sized equipment are all welcome.',
  },
  {
    q: 'Do you offer a weekly rate?',
    a: 'Yes. Stays of 7 days or more automatically switch to our cheaper weekly rate — no need to ask, it is applied for you at checkout.',
  },
];

export function LandingPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [tiers, setTiers] = useState<ItemTier[] | null>(null);
  const [whatsapp, setWhatsapp] = useState(DEFAULT_SETTINGS.support_whatsapp);
  const [videoId, setVideoId] = useState(DEFAULT_SETTINGS.walkthrough_video_id);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [hotelLabel, setHotelLabel] = useState(DEFAULT_SETTINGS.hotel_location_label);
  const [hotelAddress, setHotelAddress] = useState(DEFAULT_SETTINGS.hotel_location_address);

  useEffect(() => {
    fetch('/api/item-tiers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setTiers(Array.isArray(data?.item_tiers) ? data.item_tiers : []))
      .catch(() => setTiers([]));

    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const settings = data?.settings;
        if (!settings) return;
        if (settings.support_whatsapp) setWhatsapp(settings.support_whatsapp);
        if (typeof settings.walkthrough_video_id === 'string') setVideoId(settings.walkthrough_video_id);
        if (settings.hotel_location_label) setHotelLabel(settings.hotel_location_label);
        if (settings.hotel_location_address) setHotelAddress(settings.hotel_location_address);
      })
      .catch(() => {});
  }, []);

  const waHref = `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
    'Hello Luggage Storage Colombo, I have a question about luggage storage.',
  )}`;

  const goBook = () => router.push('/book');

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader variant="landing" />

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center pt-16 md:pt-32 pb-16 px-6 overflow-hidden">
        {/* Full-bleed decorative images — positioned against the true viewport edges, not the centered content column */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="hidden lg:block absolute left-0 top-[4.71%] h-[95.33%] w-[30%] xl:w-[34%] 2xl:w-[37.25%]">
            <Image
              src="/landing/hero-airport.png"
              alt=""
              fill
              sizes="(min-width: 1536px) 38vw, (min-width: 1280px) 34vw, 30vw"
              className="object-contain object-left"
              priority
            />
          </div>
          <div className="hidden lg:block absolute right-0 top-0 h-full w-[31%] xl:w-[35%] 2xl:w-[39.08%]">
            <Image
              src="/landing/hero-luggage.png"
              alt=""
              fill
              sizes="(min-width: 1536px) 40vw, (min-width: 1280px) 35vw, 31vw"
              className="object-contain object-right"
              priority
            />
          </div>
        </div>

        <div className="relative flex flex-col gap-[18px] items-center max-w-[980px] w-full">
          <div className="flex flex-wrap gap-2 items-center justify-center">
            <span className="bg-black flex gap-2 items-center px-3 py-2 rounded-[40px]">
              <Plane className="w-[15px] h-[15px] text-white" />
              <span className="font-semibold text-[13px] md:text-[14px] text-white whitespace-nowrap">Airport Dropoff &amp; Pickup</span>
            </span>
            <span className="bg-black flex gap-2 items-center px-3 py-2 rounded-[40px]">
              <Wallet className="w-[15px] h-[15px] text-white" />
              <span className="font-semibold text-[13px] md:text-[14px] text-white whitespace-nowrap">Lowest Pricing</span>
            </span>
            <span className="bg-black flex gap-2 items-center px-3 py-2 rounded-[40px]">
              <ShieldCheck className="w-[15px] h-[15px] text-white" />
              <span className="font-semibold text-[13px] md:text-[14px] text-white whitespace-nowrap">Fully Insured</span>
            </span>
          </div>

          <h1 className="pt-2 font-extrabold text-[#0a0a0a] text-[38px] leading-[1.05] md:text-[66px] md:leading-[69.3px] text-center tracking-[-1.2px] md:tracking-[-2.31px]">
            Luggage Storage Service<br />
            <span className="text-[#e8620a]">Colombo</span> Airport
          </h1>

          <p className="text-[#4a4a4a] text-[16px] md:text-[19px] text-center leading-[1.5] md:leading-[29.45px] max-w-[782px]">
            Secure, convenient luggage storage near Colombo airport. Drop off your bags in minutes and enjoy exploring the island hands-free and hassle-free.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4 w-full max-w-md sm:max-w-none">
            <button
              onClick={goBook}
              className="w-full sm:w-auto bg-[#e8620a] hover:bg-[#d1560a] transition-colors px-[42px] py-[19px] rounded-[100px] font-bold text-[18px] text-white whitespace-nowrap"
            >
              Book Storage Now
            </button>
            <a
              href="#pricing"
              className="w-full sm:w-auto text-center border border-[#e2e2e2] hover:bg-[#faf8f6] transition-colors px-[35px] py-5 rounded-[100px] font-bold text-[18px] text-[#0a0a0a] whitespace-nowrap"
            >
              See pricing
            </a>
          </div>

          <p className="text-[#8a8a8a] text-[14px] text-center">Open 24/7 · Cheapest Price in Sri Lanka · No booking fee</p>
        </div>
      </section>

      {/* ── Pricing (dynamic, from item_tiers) ─────────────── */}
      <section id="pricing" className="py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-7 items-center">
          <div className="flex flex-col gap-[14px] max-w-[660px] items-center">
            <p className="font-mono-ibm text-[#f09a55] text-[13px] tracking-[1.04px] text-center">PRICING</p>
            <h2 className="font-extrabold text-[#0a0a0a] text-[32px] md:text-[44px] leading-[1.1] md:leading-[48.4px] tracking-[-1.32px] text-center">
              The longer you stay, the less you pay per day
            </h2>
            <p className="text-[#5a5a5a] text-[16px] md:text-[17px] leading-[1.5] md:leading-[26.35px] text-center">
              Priced per item, per day, taxes included. The longer the stay, the lower the daily rate.
            </p>
          </div>

          <div className="bg-[rgba(204,204,204,0.12)] border border-[rgba(38,38,38,0.17)] rounded-[22px] w-full overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1.4fr_1fr_1fr] px-[34px] pt-[22px] pb-[23px] border-b border-[rgba(38,38,38,0.2)]">
              <p className="font-mono-ibm text-[#8e8e8e] text-[14px] tracking-[0.84px]">ITEM</p>
              <p className="font-bold text-[#0a0a0a] text-[24px] text-center tracking-[-0.48px]">Daily</p>
              <p className="font-bold text-[#e8620a] text-[24px] text-center tracking-[-0.48px]">Weekly</p>
            </div>

            {tiers === null && (
              <div aria-busy="true">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-3 sm:gap-0 px-[34px] py-[26px] border-b border-[rgba(38,38,38,0.2)] last:border-b-0 animate-pulse"
                  >
                    <div className="flex gap-4 items-center">
                      <span className="rounded-xl size-[76px] shrink-0 bg-[#ece7e2]" />
                      <div className="flex flex-col gap-2">
                        <span className="h-4 w-32 rounded bg-[#ece7e2]" />
                        <span className="h-3.5 w-44 rounded bg-[#ece7e2]" />
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="h-8 w-16 rounded bg-[#ece7e2]" />
                    </div>
                    <div className="flex items-center justify-center py-2.5">
                      <span className="h-8 w-16 rounded bg-[#ece7e2]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tiers !== null && tiers.length === 0 && (
              <div className="px-[34px] py-10 text-center text-[#8e8e8e] text-[14px]">Pricing is temporarily unavailable — please check back shortly.</div>
            )}

            {tiers?.map((tier, i) => (
              <div
                key={tier.id}
                className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-3 sm:gap-0 px-[34px] py-[26px] border-b border-[rgba(38,38,38,0.2)] last:border-b-0"
              >
                <div className="flex gap-4 items-center">
                  <span className="relative rounded-xl size-[76px] shrink-0 overflow-hidden bg-[#f3eee9]">
                    <Image src={TIER_IMAGES[i % TIER_IMAGES.length]} alt="" fill sizes="76px" className="object-cover" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <p className="font-bold text-[#0a0a0a] text-[19px] tracking-[-0.19px]">{tier.name}</p>
                    <p className="text-[#8e8e8e] text-[14px] leading-normal">
                      {tier.weight_spec && <>{tier.weight_spec} · </>}
                      {tier.supported_items}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <p className="font-extrabold text-[#0a0a0a] text-[30px] tracking-[-0.9px]">${tier.rate_daily_usd}</p>
                  <p className="text-[#8e8e8e] text-[12px]">per day</p>
                </div>
                <div className="bg-[rgba(232,98,10,0.12)] rounded-xl flex flex-col items-center justify-center gap-0.5 py-2.5">
                  <p className="font-extrabold text-[#e8620a] text-[30px] tracking-[-0.9px]">${tier.rate_weekly_usd}</p>
                  <p className="text-[#0a0a0a] text-[12px]">per day, after 7 days</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 w-full pt-2">
            <p className="text-[#8e8e8e] text-[14px] leading-normal max-w-[620px] text-center md:text-left">
              Our weekly rate applies for stays of 7 days or more. We&rsquo;ll automatically switch you to the cheaper weekly rate.
              Insurance is optional and calculated per item. You can choose to insure your luggage during the booking checkout.
            </p>
            <button
              onClick={goBook}
              className="shrink-0 bg-[#e8620a] hover:bg-[#d1560a] transition-colors px-9 py-[17px] rounded-[100px] font-bold text-[17px] text-white whitespace-nowrap"
            >
              Book Storage Now
            </button>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex flex-col gap-[14px] max-w-[560px]">
              <p className="font-mono-ibm text-[#e8620a] text-[13px] tracking-[1.04px]">HOW IT WORKS</p>
              <h2 className="font-extrabold text-[#0a0a0a] text-[32px] md:text-[44px] leading-[1.1] md:leading-[48.4px] tracking-[-1.32px]">
                Bags down in under two minutes
              </h2>
            </div>
            <button
              onClick={goBook}
              className="self-start bg-[#0a0a0a] hover:bg-black transition-colors px-[30px] py-4 rounded-[100px] font-bold text-[16px] text-white whitespace-nowrap"
            >
              Start a booking
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5">
            {[
              { n: '01', border: 'border-[#0a0a0a]', num: 'text-[#9a9a9a]', title: 'Book online', body: 'Pick a date, number of bags and duration. You get a confirmation by email instantly' },
              { n: '02', border: 'border-[#0a0a0a]', num: 'text-[#9a9a9a]', title: 'Drop at the designated drop-off location', body: 'Drop off your luggage at Hotel Thilon for free, or at Colombo Airport for a nominal additional fee.' },
              { n: '03', border: 'border-[#e8620a]', num: 'text-[#e8620a]', title: 'Collect when you fly', body: "Let us know your departure flight in advance, and we’ll meet you at the airport with your luggage - or you can collect it directly from Hotel Thilon." },
            ].map((step) => (
              <div key={step.n} className={`border-t-[3px] ${step.border} flex flex-col gap-[10px] pt-[27px]`}>
                <p className={`font-mono-ibm text-[13px] ${step.num}`}>{step.n}</p>
                <h3 className="font-bold text-[#0a0a0a] text-[22px] tracking-[-0.44px]">{step.title}</h3>
                <p className="text-[#5f5f5f] text-[16px] leading-[25.6px]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ───────────────────────────────────────── */}
      <section id="services" className="bg-[#faf8f6] py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-[52px]">
          <div className="flex flex-col gap-[14px] max-w-[640px]">
            <p className="font-mono-ibm text-[#e8620a] text-[13px] tracking-[1.04px]">OUR SERVICES</p>
            <h2 className="font-extrabold text-[#0a0a0a] text-[32px] md:text-[44px] leading-[1.1] md:leading-[48.4px] tracking-[-1.32px]">
              Everything you need between two flights
            </h2>
            <p className="text-[#5a5a5a] text-[16px] md:text-[17px] leading-[1.5] md:leading-[26.35px]">
              One place, 6 services. Leave your bags with us and get on with the trip.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { title: 'Secure Storage Facility', body: 'Daily storage for layovers, late checkouts and early arrivals. Any size, from a daypack to a surfboard.', Icon: Lock },
              { title: 'Long-Term Storage', body: 'Weekly rates for expats, digital nomads and anyone island-hopping light for a while. Store your luggage for as long as you need.', Icon: CalendarClock },
              { title: 'Secure 24/7 Access', body: 'Our facility is directly managed by us, with no third-party involvement. Drop off and collect your luggage anytime to fit your travel plans.', Icon: Clock },
              { title: 'Convenient Airport Location', body: "Just 2 km from the airport, making it a quick 5–10 minute trip. A convenient stop whether you're arriving, departing or between transiting.", Icon: MapPinned },
              { title: 'Airport Pickup & Delivery', body: 'We can meet you at Arrivals or bring your bags back to Departures in time for your flight. Pickup and delivery are available for a small fee.', Icon: PlaneTakeoff },
              { title: 'Flexible Payment Options', body: 'Pay conveniently using foreign, local currencies or secure card payments.', Icon: CreditCard },
            ].map(({ title, body, Icon }) => (
              <div
                key={title}
                className="group bg-white border border-[#ede8e3] flex flex-col gap-2 p-[31px] rounded-[18px] transition-all duration-300 hover:border-[#e8620a]/40 hover:shadow-[0_12px_32px_-12px_rgba(232,98,10,0.25)] hover:-translate-y-1"
              >
                <span className="bg-[#fdf0e6] flex items-center justify-center rounded-xl size-11 transition-all duration-300 group-hover:bg-[#e8620a] group-hover:scale-110">
                  <Icon className="w-5 h-5 text-[#e8620a] transition-colors duration-300 group-hover:text-white" strokeWidth={2.25} />
                </span>
                <h3 className="pt-3 font-bold text-[#0a0a0a] text-[20px] tracking-[-0.4px]">{title}</h3>
                <p className="text-[#5f5f5f] text-[15px] leading-[24px]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Locations ──────────────────────────────────────── */}
      <section className="py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-11">
          <div className="flex flex-col gap-3 max-w-[620px]">
            <p className="font-mono-ibm text-[#e8620a] text-[13px] tracking-[1.04px]">FIND US</p>
            <h2 className="font-extrabold text-[#0a0a0a] text-[28px] md:text-[40px] leading-[1.1] md:leading-[44px] tracking-[-1.2px]">
              Two locations, both minutes from your gate
            </h2>
            <p className="text-[#5a5a5a] text-[16px] md:text-[17px] leading-[1.5] md:leading-[26.35px]">
              Drop off your luggage at our partner hotel, just a 5-minute drive from the airport, available 24/7.
              Airport terminal drop-off can also be arranged in advance.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#ede8e3] rounded-[22px] overflow-hidden">
              <div className="relative h-[220px] md:h-[300px] bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
                {videoPlaying && videoId ? (
                  <iframe
                    className="absolute inset-0 size-full"
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
                    title="Colombo Airport Drop-Off & Pickup walkthrough"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <>
                    {videoId && (
                      <Image
                        src={`https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 50vw, 100vw"
                        className="object-cover opacity-70"
                      />
                    )}
                    <span className="absolute left-4 top-4 bg-black/75 flex gap-2 items-center px-[13px] py-[7px] rounded-full">
                      <span className="bg-[#e8620a] rounded-full size-[7px]" />
                      <span className="font-bold text-[12px] text-white tracking-[0.72px]">WALKTHROUGH VIDEO</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (videoId) setVideoPlaying(true);
                        else notify.info('The walkthrough video is coming soon.');
                      }}
                      aria-label="Play walkthrough video"
                      className="relative bg-[#e8620a] hover:bg-[#d1560a] transition-colors flex items-center justify-center rounded-full size-16"
                    >
                      <Play className="w-6 h-6 text-white fill-white ml-1" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 px-6 md:px-[30px] py-7">
                <h3 className="font-bold text-[#0a0a0a] text-[22px] tracking-[-0.44px]">Colombo Airport Drop-Off &amp; Pickup</h3>
                <p className="text-[#5f5f5f] text-[16px] leading-[25.6px]">
                  Bandaranaike International Airport — just outside the terminal, around a 1-minute walk. We&rsquo;ll coordinate with you in advance and be ready to receive your luggage when your flight arrives.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-2.5">
                  <span className="bg-[#faf8f6] border border-[#ede8e3] px-[14px] py-2 rounded-full font-semibold text-[#5f5f5f] text-[13px]">Just outside the terminal</span>
                  <span className="bg-[#faf8f6] border border-[#ede8e3] px-[14px] py-2 rounded-full font-semibold text-[#5f5f5f] text-[13px]">Advance Booking Required</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#ede8e3] rounded-[22px] overflow-hidden">
              <div className="relative h-[220px] md:h-[300px] bg-[#f7f5f3]">
                <iframe
                  className="absolute inset-0 size-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map showing ${hotelLabel}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(hotelAddress)}&output=embed`}
                />
                <span className="absolute right-4 top-4 bg-[#0a0a0a] flex gap-1.5 items-center pl-2 pr-3.5 py-1 rounded-full shadow-lg pointer-events-none">
                  <MapPin className="w-3.5 h-3.5 text-[#e8620a] fill-[#e8620a]" />
                  <span className="font-bold text-[12px] text-white">{hotelLabel}</span>
                </span>
              </div>
              <div className="flex flex-col gap-2 px-6 md:px-[30px] py-7">
                <h3 className="font-bold text-[#0a0a0a] text-[22px] tracking-[-0.44px]">{hotelLabel}</h3>
                <p className="text-[#5f5f5f] text-[16px] leading-[25.6px]">
                  Our partner desk in the hotel lobby, a 5-minute drive from the airport. Best if you&rsquo;re on a long layover. Store the bags, take a shower and a meal, then head back.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-2.5">
                  <span className="bg-[#faf8f6] border border-[#ede8e3] px-[14px] py-2 rounded-full font-semibold text-[#5f5f5f] text-[13px]">5 min from CMB Airport</span>
                  <span className="bg-[#faf8f6] border border-[#ede8e3] px-[14px] py-2 rounded-full font-semibold text-[#5f5f5f] text-[13px]">Walk-Ins Welcome</span>
                  <span className="bg-[#faf8f6] border border-[#ede8e3] px-[14px] py-2 rounded-full font-semibold text-[#5f5f5f] text-[13px]">Open 24/7</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────── */}
      <section className="bg-[#faf8f6] py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-11">
          <h2 className="font-extrabold text-[#0a0a0a] text-[28px] md:text-[40px] leading-[1.1] md:leading-[44px] tracking-[-1.2px] max-w-[620px]">
            Travellers who left their bags with us
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { quote: 'Twelve-hour layover, two big suitcases. Dropped them at 6am, went to Negombo beach, picked them up on the way back. Cost less than a taxi ride.', name: 'Marta K.', city: 'Warsaw' },
              { quote: 'I stored a surfboard and a suitcase for six weeks while I moved around Upcountry. Everything came back exactly as I left it.', name: 'Dinesh R.', city: 'Melbourne' },
              { quote: 'They delivered our bags to Departures 40 minutes before check-in opened, exactly as promised. Staff messaged us on WhatsApp the whole way.', name: 'The Ellis family', city: 'Manchester' },
            ].map((t) => (
              <div key={t.name} className="bg-white border border-[#ede8e3] flex flex-col gap-[22px] p-[31px] rounded-[18px]">
                <p className="text-[#0a0a0a] text-[18px] leading-[27.9px]">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex gap-3 items-center">
                  <span className="bg-[#f3eee9] rounded-full size-[38px] shrink-0" />
                  <div>
                    <p className="font-bold text-[#0a0a0a] text-[15px]">{t.name}</p>
                    <p className="text-[#8a8a8a] text-[13px]">{t.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="py-16 md:py-24 px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28">
        <div className="max-w-[900px] mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-[14px] items-center text-center">
            <p className="font-mono-ibm text-[#e8620a] text-[13px] tracking-[1.04px]">FAQ</p>
            <h2 className="font-extrabold text-[#0a0a0a] text-[28px] md:text-[44px] leading-[1.1] md:leading-[48.4px] tracking-[-1.32px]">
              Questions before you drop off
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {FAQ_ITEMS.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="border border-[#eaeaea] rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 md:px-[27px] py-[23px] text-left"
                    aria-expanded={open}
                  >
                    <span className="font-bold text-[#0a0a0a] text-[16px] md:text-[18px] tracking-[-0.18px]">{item.q}</span>
                    <span className="font-bold text-[#e8620a] text-[26px] leading-none shrink-0">{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <p className="px-6 md:px-[27px] pb-[23px] text-[#5f5f5f] text-[15px] leading-[24px]">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────────────── */}
      <section className="px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28 pb-16 md:pb-24">
        <div className="max-w-[1100px] mx-auto bg-[#e8620a] rounded-[28px] flex flex-col md:flex-row items-center justify-between gap-8 px-8 md:px-14 py-12 md:py-[72px]">
          <div className="max-w-[620px] text-center md:text-left">
            <h2 className="font-extrabold text-white text-[32px] md:text-[44px] leading-tight tracking-[-1.32px]">Land, drop, explore.</h2>
            <p className="pt-3 text-white/90 text-[16px] md:text-[18px] leading-[1.5] md:leading-[27.9px]">
              Reserve a shelf in under a minute. Free cancellation, no prepayment, and a real person on WhatsApp if anything changes.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={goBook}
              className="bg-[#0a0a0a] hover:bg-black transition-colors px-11 py-[19px] rounded-[100px] font-bold text-[18px] text-white whitespace-nowrap"
            >
              Book Storage Now
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center border border-white/50 hover:bg-white/10 transition-colors px-11 py-5 rounded-[100px] font-bold text-[18px] text-white whitespace-nowrap"
            >
              Talk to us on WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-[#fafafa] border-t border-[#efefef] px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28 py-10">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="bg-[#e8620a] flex items-center justify-center rounded-[9px] size-8 shrink-0">
              <span className="flex gap-[2px] items-end">
                <span className="bg-white h-[9px] w-1 rounded-[1px]" />
                <span className="bg-white h-[13px] w-1 rounded-[1px]" />
                <span className="bg-white h-[11px] w-1 rounded-[1px]" />
              </span>
            </span>
            <span className="font-extrabold text-[#0a0a0a] text-[16px] tracking-[-0.32px]">Luggage Storage Colombo</span>
          </Link>

          <div className="flex gap-7 items-center">
            <a href="#services" className="text-[#5f5f5f] text-[15px] hover:text-[#0a0a0a] transition-colors">Services</a>
            <a href="#pricing" className="text-[#5f5f5f] text-[15px] hover:text-[#0a0a0a] transition-colors">Pricing</a>
            <a href="#faq" className="text-[#5f5f5f] text-[15px] hover:text-[#0a0a0a] transition-colors">FAQ</a>
            <Link href="/my-bookings" className="text-[#5f5f5f] text-[15px] hover:text-[#0a0a0a] transition-colors">Contact</Link>
          </div>

          <p className="text-[#9a9a9a] text-[14px] whitespace-nowrap">© {new Date().getFullYear()} · Katunayake, Sri Lanka</p>
        </div>
      </footer>
    </div>
  );
}
