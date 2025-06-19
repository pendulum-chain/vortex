import { useTranslation } from "react-i18next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/Accordion";

export const FAQAccordion = () => {
  const { t } = useTranslation();

  const FAQ_ITEMS = [
    {
      answer: t("sections.faq.items.fees.answer"),
      id: "fees",
      question: t("sections.faq.items.fees.question")
    },
    {
      answer: t("sections.faq.items.countries.answer"),
      id: "countries",
      question: t("sections.faq.items.countries.question")
    },
    {
      answer: t("sections.faq.items.verification.answer"),
      id: "verification",
      question: t("sections.faq.items.verification.question")
    },
    {
      answer: t("sections.faq.items.cryptocurrencies.answer"),
      id: "cryptocurrencies",
      question: t("sections.faq.items.cryptocurrencies.question")
    },
    {
      answer: t("sections.faq.items.timing.answer"),
      id: "timing",
      question: t("sections.faq.items.timing.question")
    },
    {
      answer: t("sections.faq.items.business.answer"),
      id: "business",
      question: t("sections.faq.items.business.question")
    }
  ];

  return (
    <div className="mt-14 mb-24">
      <p className="mb-3 text-center font-bold text-blue-700">{t("sections.faq.learnMore")}</p>
      <h1 className="text-center font-bold text-3xl text-black">{t("sections.faq.title")}</h1>
      <div className="mt-6">
        <Accordion>
          {FAQ_ITEMS.map(({ id, question, answer }) => (
            <AccordionItem key={id} value={id}>
              <AccordionTrigger value={id}>{question}</AccordionTrigger>
              <AccordionContent value={id}>{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};
