import { CharacterDef, CharacterId } from './types.ts';

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  marcin: {
    id: 'marcin',
    name: 'Marcin',
    role: 'Kierownik Zmiany',
    title: 'Władca WZ-tek i Harmonogramu',
    color: 0x1e3a8a, // Navy / Royal Blue
    secondaryColor: 0xf59e0b, // Amber / Gold
    speed: 7.2,
    jumpForce: 8.8,
    abilityName: 'Pieczęć WZ-tki',
    abilityDescription: 'Wbija pieczęć w podłogę! Ogłusza pobliskie wózki widłowe i uspokaja wściekłych klientów z fakturami.',
    abilityCooldown: 6.0,
    voiceLines: [
      'Gdzie jest podpis na dokumencie WZ?!',
      'Paleta z Włoch miała być na regale B4!',
      'Spokojnie panowie, zgodnie z procedurą Max-Fliz!',
      'Kto przestawił gres Calacatta Gold?!',
      'Czysty magazyn to bezpieczny magazyn!'
    ],
    bio: 'Nigdy nie rozstaje się z podkładką z dokumentami i tabletem. Zna kod kreskowy każdej płytki na pamięć. Gdy krzyknie "KTO TO PODPISAŁ?!", nawet sztaplarka zwalnia.',
    stats: {
      speed: 4,
      jump: 3,
      power: 4,
      defense: 5
    }
  },
  grzesiek: {
    id: 'grzesiek',
    name: 'Grzesiek',
    role: 'Mistrz Wózka i Paleciaka',
    title: 'Drifter z Alei Sanitariatów',
    color: 0x16a34a, // Emerald Green
    secondaryColor: 0x22c55e,
    speed: 8.8,
    jumpForce: 8.4,
    abilityName: 'Turbo Paleciak',
    abilityDescription: 'Błyskawiczny ślizg do przodu z paleciakiem! Taranuje przeszkody, ogłusza natrętów i pokonuje rozlany klej.',
    abilityCooldown: 4.5,
    voiceLines: [
      'Robię zakręt na dwóch kołach, patrzcie na to!',
      'Pan Zdzichu mówi, że tak nie wolno, ale tak jest szybciej!',
      'Gres 120x280cm na widłach? Żaden problem!',
      'Trąbcie jak wjeżdżam w aleję!',
      'Maksymalny załadunek to pojęcie względne!'
    ],
    bio: 'Legenda korytarza C. Potrafi zawrócić wózkiem widłowym na monecie 5-złotowej. Nosi kamizelkę odblaskową z napisem "FAST & FLIZ-IOUS".',
    stats: {
      speed: 5,
      jump: 3,
      power: 4,
      defense: 3
    }
  },
  dawid: {
    id: 'dawid',
    name: 'Dawid',
    role: 'Ekspert od Gresu i Marmuru',
    title: 'Siłacz Wielkiego Formatu (On Wie Lepiej!)',
    color: 0xd97706, // Amber / Terracotta
    secondaryColor: 0xb45309,
    speed: 6.5,
    jumpForce: 9.8,
    abilityName: 'Rzut Gresem Bouncing Tile',
    abilityDescription: 'Rzuca twardą płytką gresową, która odbija się od ścian, eliminuje klientów i zbiera odległe przedmioty!',
    abilityCooldown: 5.0,
    voiceLines: [
      'Ja wiem lepiej, jak kłaść ten gres! Walczak nie ma pojęcia!',
      'Architekt chciał fugę 0.5mm na ogrzewanie podłogowe?! Przecież gres musi pracować! Ja wiem najlepiej!',
      'Zemsta za połamane płytki będzie cięta pod kątem 45 stopni z chłodzeniem wodnym!',
      'Płytka 120x280cm? Dajcie mi dwie na raz!',
      'Dla Max-Fliz i dla mnie nie ma rzeczy niemożliwych!'
    ],
    bio: 'Prawdziwy siłacz i bezkompromisowy ekspert ceramiki. Mówi szczerze i do bólu: "Ja wiem lepiej!". Walczak myślał, że go zatrzyma, ale Dawid wraca z zemstą wielkiego formatu!',
    stats: {
      speed: 3,
      jump: 5,
      power: 5,
      defense: 4
    }
  },
  mateusz: {
    id: 'mateusz',
    name: 'Mateusz',
    role: 'Specjalista ds. Reklamacji i VIP',
    title: 'Mistrz Dyplomacji i Espresso',
    color: 0x7c3aed, // Purple / Indigo
    secondaryColor: 0xec4899,
    speed: 8.0,
    jumpForce: 9.0,
    abilityName: 'Potrójne Espresso Max',
    abilityDescription: 'Wypija podwójne espresso z firmowego automatu! Zyskuje 4 sekundy super-szybkości, skoku i niewrażliwości.',
    abilityCooldown: 6.5,
    voiceLines: [
      'Klient VIP czeka na salonie, musimy to wysłać natychmiast!',
      'Kawa z automatu na poziomie 2 to eliksir mocy!',
      'Reklamacja? Jaka reklamacja, to jest styl rustykalny!',
      'Zapakuję to w bąbelki potrójnie, nikt się nie przyczepi!',
      'Projektant z Krakowa już dzwonił trzy razy!'
    ],
    bio: 'Zawsze w eleganckiej polówce Max-Fliz i ze stoperem w dłoni. Rozwiązuje każdy kryzys logistyczny w 30 sekund, pod warunkiem, że automat do kawy jest sprawny.',
    stats: {
      speed: 4,
      jump: 4,
      power: 3,
      defense: 4
    }
  },
  piotr: {
    id: 'piotr',
    name: 'Piotr',
    role: 'Były Pracownik / Senior Kontroler',
    title: 'Legenda Magazynu i Mistrz Poziomicy',
    color: 0xef4444, // Crimson Red
    secondaryColor: 0xfacc15, // Bright Yellow
    speed: 9.0,
    jumpForce: 9.2,
    abilityName: 'Laserowa Poziomica',
    abilityDescription: 'Wypuszcza potężne promienie precyzji z poziomicy! Obala zarzuty Walczaka i ogłuszających wrogów na całej alei.',
    abilityCooldown: 5.0,
    voiceLines: [
      'Za moich czasów to palety nosiło się w zębach, a Walczak uciekał na widok poziomicy!',
      'Ten regał stoi o 0.2 mm krzywo... Usuńmy ten błąd laserem!',
      'Znam skróty między regałami, o których nowi pracownicy nawet nie śnili!',
      'Protokół odbioru? Przecież tu wszystko jest idealnie proste!',
      'Piotr tu był i zrobił absolutny porządek!'
    ],
    bio: 'Były pracownik i żywa legenda magazynu Max-Fliz. Przetrwał 14 reorganizacji, a piosenki o jego wyczynach opowiada się przy ekspresie. Gdy wyciąga laserową poziomice, Walczak pęka!',
    stats: {
      speed: 5,
      jump: 4,
      power: 5,
      defense: 5
    }
  }
};
