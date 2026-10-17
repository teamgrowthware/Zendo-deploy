const HOST = "https://expressed-displayed-opera-hugh.trycloudflare.com";
const FILE = `${HOST}/ZendoDeployL1.zip`;

export function ZendoL1ZipLink({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <a href={FILE} className={className} target="_top" rel="noopener">
      {children ?? "Download ZendoDeployL1.zip"}
    </a>
  );
}

export const ZENDO_L1_ZIP_URL = FILE;
export const ZENDO_APP_ZIP_URL = `${HOST}/ZendoL-1_App.zip`;
