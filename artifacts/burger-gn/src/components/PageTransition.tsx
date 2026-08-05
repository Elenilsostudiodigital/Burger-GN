import React from 'react';
import { motion } from 'framer-motion';

export function PageTransition({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`min-h-screen pb-24 bg-[#0a0a0a] ${className}`}
    >
      {children}
    </motion.div>
  );
}
