// Edite aqui os produtos, preços e imagens do cardápio

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // in reais (e.g. 24.90)
  category: 'hamburguer' | 'combo' | 'bebida' | 'adicional' | 'promocao';
  image: string; // URL or placeholder
  available: boolean;
}

// Edite aqui o número do WhatsApp que receberá os pedidos
export const WHATSAPP_NUMBER = "5571999999999"; 

export const menuItems: MenuItem[] = [
  {
    id: "king-burger",
    name: "KING BURGER",
    description: "Pão com gergelim, hambúrguer 120g, cheddar, bacon crocante, alface, tomate, cebola roxa e molhos especiais.",
    price: 24.90,
    category: "hamburguer",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
    available: true,
  },
  {
    id: "pantanal-burger",
    name: "PANTANAL BURGER",
    description: "Pão batata, hambúrguer 120g, mussarela, alface americano, tomate, cebola roxa e molhos especiais.",
    price: 22.90,
    category: "hamburguer",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop",
    available: true,
  },
  {
    id: "combo-king",
    name: "COMBO KING",
    description: "King Burger + Batata Frita + Refrigerante 350ml.",
    price: 39.90,
    category: "combo",
    image: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&h=300&fit=crop",
    available: true,
  },
  {
    id: "coca-cola",
    name: "Coca-Cola",
    description: "Lata 350ml gelada.",
    price: 6.00,
    category: "bebida",
    image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=300&fit=crop",
    available: true,
  },
  {
    id: "bacon-extra",
    name: "Bacon Extra",
    description: "Porção adicional de bacon crocante.",
    price: 4.00,
    category: "adicional",
    image: "https://images.unsplash.com/photo-1606852836067-7e4d44ff71c0?w=400&h=300&fit=crop",
    available: true,
  },
  {
    id: "promo-dupla",
    name: "PROMO DUPLA",
    description: "2 Pantanal Burgers por um preço especial. Válido de segunda a quarta.",
    price: 39.90,
    category: "promocao",
    image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&h=300&fit=crop",
    available: true,
  },
];
