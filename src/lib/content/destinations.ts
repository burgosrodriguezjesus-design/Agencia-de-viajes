// Fotografías destacadas de Wikimedia Commons, servidas desde su servidor
// (Special:FilePath). Autoría y licencias en /legal/creditos
// (src/lib/content/credits.ts). Antes de producción conviene alojarlas en el
// propio dominio: basta con guardar los ficheros en /public/images y cambiar
// `src` por la ruta local.

export const HERO_IMAGE = {
  src: "https://commons.wikimedia.org/wiki/Special:FilePath/1000_Three_domes_of_Oia_in_Santorini_Photo_by_Giles_Laurent.jpg?width=1920",
  alt: "Cúpulas azules de Oia, en Santorini, sobre el mar Egeo",
  credit: "Giles Laurent · CC BY-SA 4.0",
  position: "center 60%",
};

export interface Destination {
  slug: string;
  name: string;
  query: string;
  tagline: string;
  src: string;
  alt: string;
  position: string;
}

export const DESTINATIONS: Destination[] = [
  { slug: "kioto", name: "Kioto", query: "Kioto, Japón", tagline: "Templos, jardines y tradición", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg?width=960", alt: "Fotografía de Kioto", position: "center" },
  { slug: "roma", name: "Roma", query: "Roma, Italia", tagline: "Historia en cada esquina", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Colosseo_di_Roma_panoramic.jpg?width=960", alt: "Fotografía de Roma", position: "center" },
  { slug: "paris", name: "París", query: "París, Francia", tagline: "Arte, paseos y bistrós", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Eiffel_Tower_and_Pont_Alexandre_III_at_night.jpg?width=960", alt: "Fotografía de París", position: "center" },
  { slug: "nueva-york", name: "Nueva York", query: "Nueva York, Estados Unidos", tagline: "La ciudad que no para", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Lower_Manhattan_from_Jersey_City_September_2020_panorama.jpg?width=960", alt: "Fotografía de Nueva York", position: "center" },
  { slug: "marrakech", name: "Marrakech", query: "Marrakech, Marruecos", tagline: "Zocos, riads y especias", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Oriental_hanging_lanterns._Souk_Haddadine%2C_Marrakech_Medina_%28%D8%B3%D9%88%D9%82_%D8%A7%D9%84%D8%AD%D8%AF%D8%A7%D8%AF%D9%8A%D9%86_%D9%85%D8%B1%D8%A7%D9%83%D8%B4%29.jpg?width=960", alt: "Fotografía de Marrakech", position: "center" },
  { slug: "santorini", name: "Santorini", query: "Santorini, Grecia", tagline: "Atardeceres sobre la caldera", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Thira_%28Santorini%29_-_Ia-01.jpg?width=960", alt: "Fotografía de Santorini", position: "center" },
  { slug: "islandia", name: "Islandia", query: "Reikiavik, Islandia", tagline: "Cascadas, glaciares y auroras", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Kirkjufell%2C_Iceland%2C_20240714_1631_0713.jpg?width=960", alt: "Fotografía de Islandia", position: "center" },
  { slug: "lisboa", name: "Lisboa", query: "Lisboa, Portugal", tagline: "Miradores, tranvías y fado", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Old_Arsenal_da_Marinha_and_Doca_da_Caldeirinha%2C_Cais_do_Sodr%C3%A9%2C_Lisbon%2C_Portugal_julesvernex2.jpg?width=960", alt: "Fotografía de Lisboa", position: "center" },
];
