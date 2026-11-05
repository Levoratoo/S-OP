import { useEffect } from "react";
import { useLocation } from "wouter";

function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);
  return null;
}

/** Tela removida na Parte 2 — sazonalidade por SKU na desagregação. */
export default function SazonalidadeMarcaPage() {
  return <RedirectTo href="/previsao-python" />;
}
