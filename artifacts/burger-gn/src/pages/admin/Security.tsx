import { useEffect } from 'react';
import { useLocation } from 'wouter';

/** Segurança moved into Configurações — keep route as redirect. */
export default function AdminSecurity() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation('/admin/config?tab=seguranca');
  }, [setLocation]);
  return null;
}
