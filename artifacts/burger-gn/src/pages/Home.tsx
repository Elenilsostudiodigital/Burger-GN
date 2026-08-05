import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&h=1200&fit=crop')" }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6 flex flex-col items-center text-center mt-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="w-24 h-24 border-4 border-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(201,147,10,0.3)]">
            <span className="text-primary font-black text-4xl leading-none pt-2">GN</span>
          </div>
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 leading-none">
            The Burger <span className="text-primary block mt-1">GN</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-[280px] mx-auto font-medium leading-tight">
            Hambúrguer artesanal feito na brasa, para matar sua fome de verdade.
          </p>
        </motion.div>

        <motion.div 
          className="w-full space-y-4 mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        >
          <Link href="/cardapio" className="block w-full">
            <Button size="lg" className="w-full min-h-[60px] text-lg font-bold tracking-wider rounded-2xl shadow-lg">
              FAZER PEDIDO
            </Button>
          </Link>
          <Link href="/cardapio" className="block w-full">
            <Button variant="outline" size="lg" className="w-full min-h-[60px] text-lg font-bold tracking-wider rounded-2xl border-2 border-zinc-800 bg-zinc-900/50 backdrop-blur-sm text-white hover:bg-zinc-800 hover:text-white">
              VER CARDÁPIO
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
