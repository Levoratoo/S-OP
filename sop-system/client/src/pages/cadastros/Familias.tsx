import { useEffect } from "react";
import { useLocation } from "wouter";

function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);
  return null;
}

/** Tela removida na Parte 2. */
export default function Familias() {
  return <RedirectTo href="/cadastros/produtos" />;
}
