"use client";

export type HelpSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  notes?: string[];
};

export type HelpKey =
  | "dashboard"
  | "questionnaires.list"
  | "questionnaires.new"
  | "questionnaires.edit"
  | "products.list"
  | "products.new"
  | "products.edit"
  | "requests.list"
  | "requests.detail";

export const HELP_CONTENT: Record<HelpKey, { title: string; sections: HelpSection[] }> = {
  dashboard: {
    title: "Ajutor — Panou (Dashboard)",
    sections: [
      {
        title: "Ce face această pagină",
        paragraphs: [
          "Dashboard-ul îți arată rapid câte produse și chestionare sunt active și câte cereri noi către specialist au venit din aplicație.",
          "Valorile nu se actualizează automat în timp real. Pentru valori la zi, reîncarcă pagina.",
        ],
      },
      {
        title: "Ce înseamnă cardurile",
        bullets: [
          "Produse active: produse marcate ca active.",
          "Chestionare active: chestionare marcate ca active.",
          "Cereri noi către specialist: cereri care încă nu au fost procesate.",
        ],
      },
      {
        title: "Note",
        notes: [
          "Dacă apare o eroare de acces, verifică dacă ești conectat cu un cont de administrator.",
          "Pentru actualizare, reîncarcă pagina (sau folosește butoanele „Reîmprospătează” din paginile listă).",
        ],
      },
    ],
  },

  "questionnaires.list": {
    title: "Ajutor — Chestionare (Listă)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Gestionezi chestionarele care apar în aplicație: le creezi, le editezi și le activezi/dezactivezi.",
        ],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Apasă „Creează chestionar” pentru a adăuga un chestionar nou.",
          "Apasă „Editează” pentru a modifica titlul, starea „Activ” și pentru a gestiona întrebările.",
          "Folosește switch-ul „Activ” pentru a afișa/ascunde chestionarul în aplicație.",
          "Folosește „Reîmprospătează” pentru a actualiza lista.",
        ],
      },
      {
        title: "Câmpuri importante",
        bullets: [
          "title: titlul chestionarului.",
          "active: dacă este activ, chestionarul este disponibil în aplicație.",
          "updatedAt: data ultimei actualizări.",
        ],
      },
      {
        title: "Note",
        notes: ["Dacă ai multe chestionare, folosește „Încarcă mai multe” pentru a vedea următoarele rezultate."],
      },
    ],
  },

  "questionnaires.new": {
    title: "Ajutor — Chestionare (Creează)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Creezi un chestionar nou. După creare, poți intra în ecranul de editare pentru a adăuga întrebări.",
        ],
      },
      {
        title: "Câmpuri",
        bullets: [
          "Titlu: numele chestionarului (ex: „Chestionar de onboarding”).",
          "Activ: dacă este activ, chestionarul poate fi folosit în aplicație.",
        ],
      },
      { title: "Note", notes: ["Întrebările se adaugă în pagina de editare."] },
    ],
  },

  "questionnaires.edit": {
    title: "Ajutor — Chestionare (Editează + Întrebări)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Editezi chestionarul și gestionezi întrebările din el.",
          "Întrebările controlează ce întrebări vede utilizatorul în aplicație.",
        ],
      },
      {
        title: "Întrebări — cum funcționează",
        bullets: [
          "Ordinea este dată de câmpul „Ordine” (mai mic = mai sus).",
          "Dacă întrebarea este „Activă”, ea apare în aplicație.",
          "Pentru întrebările cu opțiuni (selectare), poți ordona opțiunile și le poți activa/dezactiva.",
        ],
      },
      {
        title: "Chei și tipuri",
        bullets: [
          "Cheie: nivel / stil / distanță / prioritate / preferințe / buget.",
          "Tip: selectare unică / selectare multiplă / text / interval.",
        ],
      },
      {
        title: "Note",
        notes: [
          "După salvare, lista se actualizează.",
          "Recomandare: păstrează întrebările simple și clare pentru utilizatori.",
        ],
      },
    ],
  },

  "products.list": {
    title: "Ajutor — Produse (Listă)",
    sections: [
      { title: "Ce faci aici", paragraphs: ["Gestionezi produsele folosite în recomandări (create/edit)."] },
      {
        title: "Căutare și filtre",
        bullets: ["Caută după nume sau brand.", "„Doar active” afișează doar produsele marcate ca active."],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Apasă „Creează produs” pentru un produs nou.",
          "Apasă „Editează” pentru a modifica detaliile.",
          "Folosește „Reîmprospătează” pentru a reciti prima pagină.",
          "Folosește „Încarcă mai multe” pentru a vedea următoarele rezultate.",
        ],
      },
      {
        title: "Note",
        notes: ["Dacă ai multe produse, folosește „Încarcă mai multe” pentru a vedea următoarele rezultate."],
      },
    ],
  },

  "products.new": {
    title: "Ajutor — Produse (Creează)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: ["Creezi un produs nou. Acesta va putea fi selectat ulterior în regulile de recomandare."],
      },
      {
        title: "Câmpuri importante",
        bullets: [
          "Nume / Brand: datele afișate în listă și în selectoarele de produse.",
          "Preț + Monedă: folosite pentru afișare și filtrări viitoare (dacă se adaugă).",
          "Etichete (level/style/distance): folosite la potrivirea cu regulile.",
          "Atribute (control/spin/viteză/greutate): informații suplimentare (opțional).",
        ],
      },
      {
        title: "Imagine produs",
        bullets: [
          "Poți lipi un URL de imagine sau poți încărca o imagine direct din calculator.",
          "După încărcare, imaginea va fi legată automat de produs.",
        ],
      },
    ],
  },

  "products.edit": {
    title: "Ajutor — Produse (Editează)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: ["Editezi produsul: activare, detalii, etichete, atribute și imagine."],
      },
      {
        title: "Imagine produs",
        bullets: [
          "Dacă încarci o imagine nouă, aceasta va înlocui linkul de imagine salvat la produs.",
          "Dacă apare o eroare la încărcare, încearcă din nou sau verifică dacă ai acces de administrator.",
        ],
      },
    ],
  },

  "requests.list": {
    title: "Ajutor — Cereri către specialist (Listă)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: ["Vezi toate cererile venite din aplicație și le filtrezi după status."],
      },
      {
        title: "Statusuri",
        bullets: [
          "nou: cerere abia trimisă, fără răspuns.",
          "în lucru: cerere în proces de analiză.",
          "trimis: răspunsul a fost completat și trimis către utilizator.",
        ],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Filtrează după status pentru a prioritiza cererile noi.",
          "Apasă „Vezi” pentru detalii și pentru a răspunde.",
          "Folosește „Reîmprospătează” și „Încarcă mai multe” pentru listă.",
        ],
      },
      {
        title: "Note",
        notes: ["Dacă ai multe cereri, folosește „Încarcă mai multe” pentru a vedea următoarele rezultate."],
      },
    ],
  },

  "requests.detail": {
    title: "Ajutor — Cerere către specialist (Detalii + Răspuns)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: ["Analizezi răspunsurile utilizatorului și trimiți un răspuns cu 1–3 recomandări + mesaj."],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Verifică „Răspunsuri” (answers) și, dacă există, notița utilizatorului (note).",
          "Schimbă statusul în „în lucru” când te apuci de cerere.",
          "Completează mesajul și selectează produsele recomandate.",
          "Apasă „Trimite răspunsul” și setează statusul în „trimis” (în funcție de flux).",
        ],
      },
      {
        title: "Note",
        notes: [
          "După ce trimiți răspunsul, utilizatorul îl va vedea în aplicație.",
          "Dacă ai schimbat ceva și nu se vede imediat, revino la listă și deschide din nou cererea.",
        ],
      },
    ],
  },
};
