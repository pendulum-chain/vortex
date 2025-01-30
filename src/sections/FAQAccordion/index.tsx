import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/Accordion';

const FAQ_ITEMS = [
  {
    id: 'fees',
    question: 'How much does Vortex charge in fees?',
    answer:
      'Vortex&apos;s fees are completely transparent and depend on the payment method you choose. These are all-in fees, meaning there are no hidden charges from Vortex or local banking partners. The cost of your transfer comes from the clearly disclosed fee and exchange rate. Unlike many providers that claim &quot;no fees&quot; but hide extra costs in inflated exchange rates, Vortex ensures you&apos;re never overcharged. Our fees are shown upfront so you always know exactly what you&apos;re paying.',
  },
  {
    id: 'countries',
    question: 'Which countries and currencies does Vortex support?',
    answer:
      'Vortex is available in all 44 European countries and also supports users in Brazil and Argentina. Our service coverage is constantly expanding, with new countries being added every few weeks. As we grow, we aim to provide access to even more regions and currencies to better serve our global users.',
  },
  {
    id: 'verification',
    question: 'How long does verification take?',
    answer:
      'Our KYC process is designed to be as fast and seamless as possible, usually taking less than six minutes to complete. In rare cases where additional checks are necessary, verification may take until the next business day. The time required largely depends on the validity and completeness of the documents provided. We recommend double-checking your submission to ensure a smooth process.',
  },
  {
    id: 'cryptocurrencies',
    question: 'What cryptocurrencies are supported?',
    answer:
      'Vortex supports a range of stablecoins, including USDC and USDT. These stablecoins are available on multiple blockchain networks, such as Polkadot, Arbitrum, Avalanche, Base, BNB, Ethereum, and Polygon. We are constantly working to expand our offerings and will add additional cryptocurrencies and networks in the future to meet growing user demands.',
  },
  {
    id: 'timing',
    question: 'How long does it take to sell crypto (for the money to arrive)?',
    answer:
      'The crypto-to-fiat transaction process with Vortex is exceptionally quick, taking only about three minutes. If your bank supports instant payments, you&apos;ll see the funds in your account within five minutes. For banks without instant payment capabilities, the processing time depends on your bank, but it usually takes one to two business days for the money to arrive.',
  },
  {
    id: 'business',
    question: 'Does Vortex offer solutions for businesses?',
    answer:
      'Absolutely! Vortex offers tailored solutions for businesses looking to integrate our platform into their services. Companies can provide their users with Vortex&apos;s competitive rates, ease of use, and seamless transactions. If you&apos;re interested, our sales team is ready to discuss how we can help meet your specific needs and set up a partnership that delivers value for your business.',
  },
];

export const FAQAccordion = () => {
  return (
    <Accordion defaultValue={['fees']}>
      {FAQ_ITEMS.map(({ id, question, answer }) => (
        <AccordionItem value={id} key={id}>
          <AccordionTrigger value={id}>{question}</AccordionTrigger>
          <AccordionContent value={id}>{answer}</AccordionContent>
        </AccordionItem>
      ))}

      <p className="mt-4 text-center text-gray-600">
        For any additional questions, don&apos;t hesitate to reach out to us. We&apos;re here to help!
      </p>
    </Accordion>
  );
};
