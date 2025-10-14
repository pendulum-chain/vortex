import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {DEFAULT_LANGUAGE, getBrowserLanguage, getLanguageFromPath, Language, LANGUAGE_FAMILIES} from './helpers';

// Setup global window mock for Node.js test environment
declare global {
  namespace NodeJS {
    interface Global {
      window: any;
    }
  }
}

const mockWindow = () => {
  (global as any).window = {
    location: { pathname: '/' }
  };
};

const mockNavigator = (languages: string[], language?: string) => {
  (global as any).window.navigator = {
    languages,
    language: language || languages[0]
  };
};

describe('Language Detection Helpers', () => {
  beforeEach(() => {
    mockWindow();
  });

  afterEach(() => {
    // Clean up mocks
    delete (global as any).window;
  });

  describe('LANGUAGE_FAMILIES', () => {
    it('should map language codes correctly', () => {
      expect(LANGUAGE_FAMILIES.pt).toBe(Language.Portuguese_Brazil);
      expect(LANGUAGE_FAMILIES.en).toBe(Language.English);
    });

    it('should have the correct structure for extensibility', () => {
      expect(typeof LANGUAGE_FAMILIES).toBe('object');
      expect(Object.keys(LANGUAGE_FAMILIES)).toContain('pt');
      expect(Object.keys(LANGUAGE_FAMILIES)).toContain('en');
    });
  });

  describe('DEFAULT_LANGUAGE', () => {
    it('should be English', () => {
      expect(DEFAULT_LANGUAGE).toBe(Language.English);
    });
  });

  describe('getBrowserLanguage', () => {
    it('should return Portuguese_Brazil for Portuguese browser languages', () => {
      mockNavigator(['pt-BR', 'en-US']);
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);

      mockNavigator(['pt-PT']);
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);

      mockNavigator(['pt']);
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);
    });

    it('should return English for English browser languages', () => {
      mockNavigator(['en-US']);
      expect(getBrowserLanguage()).toBe(Language.English);

      mockNavigator(['en-GB', 'pt-BR']);
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should prioritize first supported language in navigator.languages', () => {
      mockNavigator(['es-ES', 'pt-BR', 'en-US']);
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);

      mockNavigator(['fr-FR', 'de-DE', 'en-GB']);
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should return default language for unsupported languages', () => {
      mockNavigator(['es-ES', 'fr-FR', 'de-DE']);
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should handle edge cases safely', () => {
      mockNavigator([]);
      expect(getBrowserLanguage()).toBe(Language.English);

      mockNavigator(['', null as any, undefined as any]);
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should return default language when navigator is undefined', () => {
      delete (global as any).window.navigator;
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should handle navigator.languages fallback correctly', () => {
      (global as any).window.navigator = {
        language: 'pt-BR'
      };
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);
    });

    it('should extract language code correctly from complex locale strings', () => {
      mockNavigator(['pt-BR-variant']);
      expect(getBrowserLanguage()).toBe(Language.Portuguese_Brazil);

      mockNavigator(['en-US-posix']);
      expect(getBrowserLanguage()).toBe(Language.English);
    });

    it('should return default when window is undefined (SSR)', () => {
      delete (global as any).window;
      expect(getBrowserLanguage()).toBe(Language.English);
    });
  });

  describe('getLanguageFromPath', () => {
    it('should detect language from URL path', () => {
      (global as any).window.location.pathname = '/en/dashboard';
      expect(getLanguageFromPath()).toBe(Language.English);

      (global as any).window.location.pathname = '/pt-br/dashboard';
      expect(getLanguageFromPath()).toBe(Language.Portuguese_Brazil);
    });

    it('should fall back to browser language when no language in path', () => {
      (global as any).window.location.pathname = '/dashboard';
      mockNavigator(['pt-BR']);
      expect(getLanguageFromPath()).toBe(Language.Portuguese_Brazil);

      mockNavigator(['en-US']);
      expect(getLanguageFromPath()).toBe(Language.English);
    });

    it('should prioritize URL path over browser language', () => {
      (global as any).window.location.pathname = '/en/dashboard';
      mockNavigator(['pt-BR']);
      expect(getLanguageFromPath()).toBe(Language.English);
    });

    it('should handle case sensitivity in URL paths', () => {
      (global as any).window.location.pathname = '/EN/dashboard';
      expect(getLanguageFromPath()).toBe(Language.English);

      (global as any).window.location.pathname = '/PT-BR/dashboard';
      expect(getLanguageFromPath()).toBe(Language.Portuguese_Brazil);
    });

    it('should return default when window is undefined (SSR)', () => {
      delete (global as any).window;
      expect(getLanguageFromPath()).toBe(Language.English);
    });
  });
});

describe('Extensibility Example', () => {
  it('demonstrates how easy it would be to add Spanish support', () => {
    expect(Object.keys(LANGUAGE_FAMILIES)).toHaveLength(2);

    const extendedFamilies = {
      ...LANGUAGE_FAMILIES,
      es: 'es' as any
    };

    expect(Object.keys(extendedFamilies)).toHaveLength(3);
    expect(extendedFamilies.es).toBe('es');
  });

  it('demonstrates the simplicity of the language code extraction', () => {

    const testCases = [
      { input: 'pt-BR', expected: 'pt' },
      { input: 'pt-PT', expected: 'pt' },
      { input: 'en-US', expected: 'en' },
      { input: 'en-GB', expected: 'en' },
      { input: 'es-ES', expected: 'es' },
      { input: 'es-MX', expected: 'es' }
    ];

    testCases.forEach(({ input, expected }) => {
      const languageCode = input.toLowerCase().split('-')[0];
      expect(languageCode).toBe(expected);
    });
  });
});
