import satoshipayLogo from '../../assets/logo/satoshipay.svg';

export function PoweredBy() {
  return (
    <div className="flex items-center justify-center">
      <p className="mr-1 text-sm text-gray-500">Powered by</p>
      <a href="https://satoshipay.io" target="_blank" rel="noopener noreferrer" className="transition hover:opacity-80">
        <img src={satoshipayLogo} alt="Satoshipay" />
      </a>
    </div>
  );
}
