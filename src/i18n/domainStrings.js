import { getLocale } from "./i18n.js";

// The recommendation engine and clothing-preferences module use plain English
// strings ("Rain boots", "Light-Medium", ...) as their canonical, *stored*
// values (clothing preferences persist these exact strings in localStorage).
// Changing the canonical strings would silently invalidate every existing
// user's saved preferences, so instead this is a display-only translation
// lookup: canonical English string in, localized label out, with the
// original string returned unchanged for any entry this dictionary hasn't
// covered (never throws on a miss, never blocks rendering).
const es = {
  // Clothing items (footwear, pants, shirts, outerwear, accessories)
  Sneakers: "Zapatillas",
  Loafers: "Mocasines",
  Flats: "Zapatos bajos",
  Sandals: "Sandalias",
  Slides: "Sandalias de piscina",
  "Flip-flops": "Chanclas",
  "Ankle boots": "Botines",
  "Rain boots": "Botas de lluvia",
  "Snow boots": "Botas de nieve",
  "Dress shoes": "Zapatos de vestir",
  Clogs: "Zuecos",
  Mules: "Babuchas",
  Heels: "Tacones",
  Jeans: "Jeans",
  Chinos: "Pantalones chinos",
  Trousers: "Pantalones de vestir",
  Joggers: "Joggers",
  Sweatpants: "Pantalones deportivos",
  Leggings: "Leggings",
  Shorts: "Shorts",
  "Cargo pants": "Pantalones cargo",
  "Cargo Pants": "Pantalones cargo",
  "Linen pants": "Pantalones de lino",
  Skirt: "Falda",
  Dress: "Vestido",
  Jumpsuit: "Mono",
  Romper: "Enterizo corto",
  Tights: "Mallas",
  "Thermal leggings/base layer": "Mallas térmicas/capa base",
  "Thermal Pants": "Pantalón térmico",
  Pants: "Pantalón",
  "T-shirt": "Camiseta",
  "Long-sleeve shirt": "Camisa de manga larga",
  "Light Long-Sleeve": "Manga larga ligera",
  "Tank top": "Camiseta sin mangas",
  "Tank Top": "Camiseta sin mangas",
  "Sleeveless top": "Top sin mangas",
  "Crop top": "Top corto",
  "Tube top": "Top tubo",
  "Halter top": "Top halter",
  Camisole: "Camisola",
  Bodysuit: "Body",
  "Button-down shirt": "Camisa de botones",
  "Button-Up Shirt": "Camisa de botones",
  "Linen shirt": "Camisa de lino",
  "Polo shirt": "Polo",
  "Polo Shirt": "Polo",
  Blouse: "Blusa",
  "Knit top": "Top tejido",
  Henley: "Camisa henley",
  "Flannel shirt": "Camisa de franela",
  Turtleneck: "Cuello alto",
  "Mock-neck top": "Top de cuello simulado",
  "Thermal top/base layer": "Capa base térmica",
  "Thermal Layer": "Capa térmica",
  Hoodie: "Sudadera con capucha",
  "Crewneck sweatshirt": "Sudadera de cuello redondo",
  "Quarter-zip": "Suéter con cierre corto",
  Cardigan: "Cárdigan",
  Sweater: "Suéter",
  "Sweater vest": "Chaleco de punto",
  "Fleece jacket": "Chaqueta polar",
  "Denim jacket": "Chaqueta de mezclilla",
  "Bomber jacket": "Chaqueta bomber",
  Windbreaker: "Cortavientos",
  "Rain jacket": "Chaqueta de lluvia",
  "Waterproof shell": "Chaqueta impermeable",
  "Trench coat": "Gabardina",
  Blazer: "Blazer",
  Vest: "Chaleco",
  "Puffer vest": "Chaleco acolchado",
  "Puffer jacket": "Chaqueta acolchada",
  "Heavy coat": "Abrigo grueso",
  "Heavy Coat": "Abrigo grueso",
  Parka: "Parca",
  "Wool coat": "Abrigo de lana",
  "Shawl/wrap": "Chal/estola",
  "Light Jacket": "Chaqueta ligera",
  Umbrella: "Paraguas",
  Sunglasses: "Gafas de sol",
  "Baseball cap": "Gorra",
  "Sun hat": "Sombrero para el sol",
  Beanie: "Gorro",
  Scarf: "Bufanda",
  Gloves: "Guantes",
  Earmuffs: "Orejeras",
  "Neck gaiter": "Cuello de tela",
  "Rain poncho": "Poncho de lluvia",
  "Face covering/neck warmer": "Cubrebocas/calentador de cuello",
  "Winter shoes": "Zapatos de invierno",
  Hat: "Sombrero",
  "Rain Jacket": "Chaqueta de lluvia",

  // Weight labels
  Light: "Ligero",
  "Light-Medium": "Ligero-medio",
  Medium: "Medio",
  "Medium-Heavy": "Medio-grueso",
  Heavy: "Grueso",

  // Category labels
  Footwear: "Calzado",
  Shirts: "Camisas",
  Outerwear: "Abrigo",
  Accessories: "Accesorios",
  Top: "Parte superior",
  Bottom: "Parte inferior",

  // Purpose labels (accessories)
  Rain: "Lluvia",
  Snow: "Nieve",
  Sun: "Sol",
  Wind: "Viento",
  Cold: "Frío",
  "Rain/Sun": "Lluvia/Sol",
  "Cold/Wind": "Frío/Viento",
  "Rain/Wind": "Lluvia/Viento",

  // Mismatch warnings
  "May not be ideal for snow.": "Puede no ser ideal para la nieve.",
  "May not be ideal for rain.": "Puede no ser ideal para la lluvia.",
  "May not block much wind.": "Puede no bloquear mucho el viento.",
  "May not offer much sun protection.": "Puede no ofrecer mucha protección solar.",
  "May not help much with the cold.": "Puede no ayudar mucho con el frío.",
  "May be too light for the cold.": "Puede ser demasiado ligero para el frío.",
  "Closest match from your closet.": "La opción más cercana de tu armario."
};

const DICTIONARIES = { es };

export function translateDomainString(value) {
  if (typeof value !== "string") {
    return value;
  }

  const locale = getLocale();
  const dictionary = DICTIONARIES[locale];

  return dictionary?.[value] ?? value;
}

// Splits "Umbrella / Rain Jacket" style compound labels, translates each
// part, and rejoins with the same separator.
export function translateDomainPhrase(value, separator = " / ") {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .split(separator)
    .map((part) => translateDomainString(part.trim()))
    .join(separator);
}
