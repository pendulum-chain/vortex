import { useTranslation } from 'react-i18next';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/Accordion';

export const FAQAccordion = () => {
  const { t } = useTranslation();

  const FAQ_ITEMS = [
    {
      id: 'fees',
      question: t('sections.faq.items.fees.question'),
      answer: t('sections.faq.items.fees.answer'),
    },
    {
      id: 'countries',
      question: t('sections.faq.items.countries.question'),
      answer: t('sections.faq.items.countries.answer'),
    },
    {
      id: 'verification',
      question: t('sections.faq.items.verification.question'),
      answer: t('sections.faq.items.verification.answer'),
    },
    {
      id: 'cryptocurrencies',
      question: t('sections.faq.items.cryptocurrencies.question'),
      answer: t('sections.faq.items.cryptocurrencies.answer'),
    },
    {
      id: 'timing',
      question: t('sections.faq.items.timing.question'),
      answer: t('sections.faq.items.timing.answer'),
    },
    {
      id: 'business',
      question: t('sections.faq.items.business.question'),
      answer: t('sections.faq.items.business.answer'),
    },
  ];

  return (
    <div className="mb-24 mt-14">
      <p className="font-bold mb-3 text-center text-blue-700">{t('sections.faq.learnMore')}</p>
      <h1 className="text-3xl font-bold text-center text-black">{t('sections.faq.title')}</h1>
      <div className="mt-6">
        <Accordion>
          {FAQ_ITEMS.map(({ id, question, answer }) => (
            <AccordionItem value={id} key={id}>
              <AccordionTrigger value={id}>{question}</AccordionTrigger>
              <AccordionContent value={id}>{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};
