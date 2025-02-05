import PERCENT from '../../assets/why-vortex/percent.svg';
import COFFEE from '../../assets/why-vortex/coffee.svg';
import LOCK from '../../assets/why-vortex/lock.svg';
import USER_CHECK from '../../assets/why-vortex/user-check.svg';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: PERCENT,
    title: 'Lower Fees, Better Value',
    description:
      'Fees are at just 0.25%, far below the market average. There are no hidden fees in the exchange rates.',
  },
  {
    icon: COFFEE,
    title: 'Easy to Use',
    description: 'Sell your crypto easily without the need for a centralized exchange.',
  },
  {
    icon: LOCK,
    title: 'Security First, Always',
    description: 'Vortex Network is non-custodial by design. Your assets are handled with care and security.',
  },
  {
    icon: USER_CHECK,
    title: 'Smart KYC',
    description:
      'Get verified quickly and enjoy high transaction limits and a seamless and user-friendly verification process.',
  },
];

const FeatureCard = ({ icon, title, description }: Feature) => (
  <div>
    <div className="shadow-xl border-1 border-gray-100 rounded-2xl w-[70px] h-[70px] flex items-center justify-center">
      <img src={icon} alt={title} className="w-[40px] mx-auto h-[40px] text-primary filter-primary" />
    </div>
    <h3 className="mt-6 text-xl font-bold text-blue-900">{title}</h3>
    <p className="mt-3 text-black">{description}</p>
  </div>
);

export const WhyVortex = () => (
  <section className="container pb-24 mx-auto mt-28">
    <div className="grid grid-cols-2">
      <h1 className="text-4xl text-black sm:text-5xl">
        Sell Crypto the secure Way with <strong className="text-primary">Vortex Finance</strong>?
      </h1>
      <div className="grid grid-cols-1 mt-6 sm:mt-12 gap-x-20 gap-y-8 md:grid-cols-2">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </div>
  </section>
);
