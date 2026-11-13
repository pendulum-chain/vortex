import { ArrowRightIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import brazil from "../../assets/countries/brazil.png";
import fatiaLight from "../../assets/products/fatia-wordmark-reversed.svg";
import goldBar from "../../assets/products/gold-bar.webp";
import goldPreview from "../../assets/products/gold-preview.jpg";
import ouro from "../../assets/products/ouro-wordmark.png";
import stocksMan800 from "../../assets/products/stocks-man-800.jpg";
import stocksMan1440 from "../../assets/products/stocks-man-1440.jpg";
import stocksPreview from "../../assets/products/stocks-preview.jpg";
import "./styles.css";

const PRODUCTS = [
  { href: "/pt-br/gold/", key: "gold", preview: goldPreview },
  { href: "/pt-br/stocks/", key: "stocks", preview: stocksPreview }
] as const;

export function ProductDiscovery({ audience }: { audience: "individuals" | "business" }) {
  const { t, i18n } = useTranslation();
  const business = audience === "business";
  const key = `sections.productDiscovery.${audience}`;
  const headingId = `discover-${audience}`;
  return (
    <section aria-labelledby={headingId} className={`product-discovery product-discovery--${audience}`}>
      <div className="product-discovery__inner">
        <p className="product-discovery__eyebrow">{t(`${key}.eyebrow`)}</p>
        <div className="product-discovery__heading-row">
          <h2 id={headingId}>
            {t(`${key}.title`)}
            {!business && <span>{t(`${key}.accent`)}</span>}
          </h2>
          <p className="product-discovery__market">
            <img alt="" height="20" loading="lazy" src={brazil} width="20" />
            {t(`${key}.market`)}
          </p>
        </div>
        <p className="product-discovery__description">{t(`${key}.description`)}</p>
        <div className="product-discovery__grid">
          {PRODUCTS.map(product => {
            const id = `${headingId}-${product.key}`;
            return (
              <a
                aria-labelledby={`${id}-title ${id}-action`}
                className={`product-discovery__card product-discovery__card--${product.key}`}
                href={product.href}
                key={product.key}
              >
                {business ? (
                  <>
                    <div className="product-discovery__example-copy">
                      <h3 id={`${id}-title`}>{t(`${key}.${product.key}.title`)}</h3>
                      <span className="product-discovery__example-link" id={`${id}-action`}>
                        {t(`${key}.${product.key}.action`)}
                        <ArrowRightIcon aria-hidden="true" />
                      </span>
                    </div>
                    <img
                      alt={t(`${key}.${product.key}.previewAlt`)}
                      className="product-discovery__preview"
                      decoding="async"
                      height="800"
                      loading="lazy"
                      src={product.preview}
                      width="1200"
                    />
                  </>
                ) : (
                  <>
                    {product.key === "gold" ? (
                      <img
                        alt=""
                        className="product-discovery__gold"
                        decoding="async"
                        height="1536"
                        loading="lazy"
                        src={goldBar}
                        width="1024"
                      />
                    ) : (
                      <img
                        alt=""
                        className="product-discovery__photo"
                        decoding="async"
                        height="960"
                        loading="lazy"
                        sizes="(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw"
                        src={stocksMan800}
                        srcSet={`${stocksMan800} 800w, ${stocksMan1440} 1440w`}
                        width="1440"
                      />
                    )}
                    <div className="product-discovery__card-copy">
                      <div className="product-discovery__brand">
                        <img
                          alt={product.key === "gold" ? "ouro." : "fatia."}
                          height="60"
                          loading="lazy"
                          src={product.key === "stocks" ? fatiaLight : ouro}
                          width="160"
                        />
                        <span>by Vortex</span>
                      </div>
                      <div>
                        <h3 id={`${id}-title`}>{t(`${key}.${product.key}.title`)}</h3>
                        <p>{t(`${key}.${product.key}.description`)}</p>
                      </div>
                      <span className="product-discovery__action" id={`${id}-action`}>
                        {t(`${key}.${product.key}.action`)}
                        <ArrowRightIcon aria-hidden="true" />
                      </span>
                    </div>
                  </>
                )}
              </a>
            );
          })}
        </div>
        {!business && <p className="product-discovery__qualification">{t(`${key}.qualification`)}</p>}
        {business && (
          <div className="product-discovery__business-actions">
            <a
              className="btn btn-vortex-primary"
              href={i18n.resolvedLanguage?.startsWith("pt") ? "/pt-BR/contact" : "/en/contact"}
            >
              {t(`${key}.build`)}
            </a>
            <a
              className="product-discovery__docs"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t(`${key}.docs`)}
              <ArrowTopRightOnSquareIcon aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
