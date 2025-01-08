import DOLLAR from '../../assets/why-vortex/dollar.png';
import THUMB from '../../assets/why-vortex/thumb.png';
import PADLOCK from '../../assets/why-vortex/padlock.png';

interface Feature {
  icon: string;
  title: string;
  description: string;
  subtext: string;
}

const features: Feature[] = [
  {
    icon: DOLLAR,
    title: 'Lower Fees',
    description: 'Offramping fees at just 0.5%, well below market average.',
    subtext: 'Keep more of what you earn.',
  },
  {
    icon: THUMB,
    title: 'Ease of Use',
    description: 'Fast settlement and a simple user interface available 24/7.',
    subtext: 'Bypass centralized exchanges entirely.',
  },
  {
    icon: PADLOCK,
    title: 'Security First',
    description: 'Non-custodial and audit-secured with Smart KYC.',
    subtext: 'Your funds are always protected.',
  },
];

const FeatureCard = ({ icon, title, description, subtext }: Feature) => (
  <div className="flex flex-col items-center text-center">
    <img src={icon} alt={title} className="w-[100px] h-[100px] mb-4" />
    <h3 className="mb-4 text-xl font-bold text-blue-900">{title}</h3>
    <p className="mb-2 text-black">{description}</p>
    <p className="text-gray-600 text-pink-600">{subtext}</p>
  </div>
);

export const WhyVortex = () => (
  <section className="container py-12 mx-auto mt-12">
    <h1 className="mb-6 text-4xl text-center text-black">Why Vortex?</h1>
    <div className="grid grid-cols-1 gap-x-20 gap-y-8 md:grid-cols-3">
      {features.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </div>
  </section>
);
