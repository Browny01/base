"use client";

import { ListPage, type ListPageConfig } from "@/components/list-page";
import { ShoppingCart } from "lucide-react";

const CONFIG: ListPageConfig = {
  dataKey: "shoppingList",
  title: "Wish List",
  addLabel: "Add Item",
  namePlaceholder: "What do you want?…",
  emptyIcon: ShoppingCart,
  emptyText: "Your wish list is empty. Start adding things you want!",
  gotLabel: (n) => `Got (${n})`,
  categories: [
    { value: "clothing",    label: "Clothing",    emoji: "👔" },
    { value: "shoes",       label: "Shoes",       emoji: "👟" },
    { value: "tech",        label: "Tech",        emoji: "💻" },
    { value: "gaming",      label: "Gaming",      emoji: "🎮" },
    { value: "home",        label: "Home",        emoji: "🏠" },
    { value: "furniture",   label: "Furniture",   emoji: "🛋️" },
    { value: "books",       label: "Books",       emoji: "📚" },
    { value: "fitness",     label: "Fitness",     emoji: "💪" },
    { value: "accessories", label: "Accessories", emoji: "⌚" },
    { value: "other",       label: "Other",       emoji: "📦" },
  ],
};

export function ShoppingListPage() {
  return <ListPage cfg={CONFIG} />;
}