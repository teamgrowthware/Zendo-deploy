const FILE = "/ZendoCoin-Polygon_Mainnet.zip";

export function ZendoCoinZipLink({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <a href={FILE} className={className} target="_top" rel="noopener">
      {children ?? "Download ZendoCoin-Polygon_Mainnet.zip"}
    </a>
  );
}

export const ZENDOCOIN_ZIP_URL = FILE;
