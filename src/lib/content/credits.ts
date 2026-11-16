// Autoría y licencia de las fotografías de la página de inicio.
export interface PhotoCredit {
  file: string;
  title: string;
  author: string;
  license: string;
  source: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  { file: "hero", title: "1000 Three domes of Oia in Santorini Photo by Giles Laurent", author: "Giles Laurent", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1000_Three_domes_of_Oia_in_Santorini_Photo_by_Giles_Laurent.jpg" },
  { file: "kioto", title: "Torii path with lantern at Fushimi Inari Taisha Shrine, Kyoto, Japan", author: "Basile Morin", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg" },
  { file: "roma", title: "Colosseo di Roma panoramic", author: "Paolo Costa Baldi", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Colosseo_di_Roma_panoramic.jpg" },
  { file: "paris", title: "Eiffel Tower and Pont Alexandre III at night", author: "Getfunky Paris", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Eiffel_Tower_and_Pont_Alexandre_III_at_night.jpg" },
  { file: "nueva-york", title: "Lower Manhattan from Jersey City September 2020 panorama", author: "King of Hearts", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_September_2020_panorama.jpg" },
  { file: "marrakech", title: "Oriental hanging lanterns. Souk Haddadine, Marrakech Medina (سوق الحدادين مراكش)", author: "Petar Milošević", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Oriental_hanging_lanterns._Souk_Haddadine,_Marrakech_Medina_(%D8%B3%D9%88%D9%82_%D8%A7%D9%84%D8%AD%D8%AF%D8%A7%D8%AF%D9%8A%D9%86_%D9%85%D8%B1%D8%A7%D9%83%D8%B4).jpg" },
  { file: "santorini", title: "Thira (Santorini) - Ia-01", author: "Taxiarchos228", license: "FAL", source: "https://commons.wikimedia.org/wiki/File:Thira_(Santorini)_-_Ia-01.jpg" },
  { file: "islandia", title: "Kirkjufell, Iceland, 20240714 1631 0713", author: "Jakub Hałun", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Kirkjufell,_Iceland,_20240714_1631_0713.jpg" },
  { file: "lisboa", title: "Old Arsenal da Marinha and Doca da Caldeirinha, Cais do Sodré, Lisbon, Portugal julesvernex2", author: "Jules Verne Times Two", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Old_Arsenal_da_Marinha_and_Doca_da_Caldeirinha,_Cais_do_Sodr%C3%A9,_Lisbon,_Portugal_julesvernex2.jpg" },
];
