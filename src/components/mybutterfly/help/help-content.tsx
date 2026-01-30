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
  | "requests.detail"
  | "questionnaire-completions.list"
  | "questionnaire-completions.detail"
  | "vocabulary";

export const HELP_CONTENT: Record<HelpKey, { title: string; sections: HelpSection[] }> = {
  dashboard: {
    title: "Ajutor — Panou (Dashboard)",
    sections: [
      {
        title: "Ce face această pagină",
        paragraphs: [
          "Dashboard-ul îți oferă o vedere de ansamblu asupra produselor/chestionarelor active, activității chestionarelor (starts + completări) și cererilor către specialist.",
          "Datele nu se actualizează automat în timp real. Pentru valori la zi, reîncarcă pagina.",
        ],
      },
      {
        title: "KPI-uri (cardurile de sus)",
        bullets: [
          "Produse active: numărul produselor marcate ca „active”.",
          "Chestionare active: numărul chestionarelor marcate ca „active”.",
          "Cereri noi către specialist: numărul cererilor cu status „new/nou”.",
        ],
      },
      {
        title: "Analytics chestionare",
        paragraphs: [
          "Alege un chestionar activ și o perioadă (7 / 30 / 90 zile). Graficul arată pe zile câte sesiuni au fost începute (starts) și câte au fost finalizate (completări).",
          "Sub grafic vezi „Distribuția răspunsurilor (top)” pe câteva dimensiuni (Nivel/Stil/Distanță/Prioritate/Preferințe/Buget).",
        ],
        bullets: [
          "Rata de completare: completări / starts în perioada selectată.",
          "Dacă nu există date în perioada aleasă, apare mesajul „Nu există date în perioada selectată.”",
        ],
      },
      {
        title: "Cereri către specialist (activitate)",
        paragraphs: [
          "Graficul agregă cererile pe zile, pentru perioada selectată (7 / 30 / 90 zile).",
          "Poți schimba metrica afișată: Total / Noi / În lucru / Trimise.",
        ],
      },
      {
        title: "Cereri recente",
        paragraphs: [
          "Tabelul arată ultimele cereri (implicit: 8) pentru statusul „nou”, cu data creării, chestionarul asociat și datele de contact.",
        ],
        bullets: [
          "„Vezi” deschide cererea (detalii + răspuns).",
          "„Vezi toate cererile” te duce în lista completă de cereri.",
        ],
      },
      {
        title: "Note",
        notes: [
          "Dacă apare o eroare de acces, verifică dacă ești conectat cu un cont de administrator.",
          "Pentru actualizare, reîncarcă pagina. Graficele se recitesc și când schimbi chestionarul / perioada / metrica.",
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
          "Folosește switch-ul „Activ” pentru a activa/dezactiva chestionarul (vizibil în aplicație).",
          "Folosește „Reîmprospătează” pentru a reciti prima pagină a listei.",
          "Folosește „Încarcă mai multe” pentru a încărca următoarele rezultate.",
          "Apasă „Șterge” pentru a elimina un chestionar (cu confirmare).",
        ],
      },
      {
        title: "Ce înseamnă coloanele",
        bullets: [
          "Titlu: numele chestionarului.",
          "Activ: dacă este pornit, chestionarul este disponibil în aplicație.",
          "Actualizat: data ultimei actualizări.",
          "Acțiuni: „Editează” / „Șterge”.",
        ],
      },
      {
        title: "Note",
        notes: [
          "La „Șterge” se șterge și conținutul chestionarului (întrebările lui).",
          "Dacă ai multe chestionare, folosește „Încarcă mai multe” pentru a vedea următoarele rezultate.",
        ],
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
          "Editezi chestionarul (Titlu + Activ) și gestionezi întrebările din el.",
          "Întrebările controlează ce vede utilizatorul în aplicație și cum se calculează recomandările (în funcție de „Cheie”).",
        ],
      },
      {
        title: "Lista de întrebări (tabel)",
        bullets: [
          "„Ordine” (order): mai mic = întrebarea apare mai sus în chestionar.",
          "„Cheie”: ce categorie/dimensiune reprezintă răspunsul (ex: level/style/distance/priority, sau chei din Vocabulary).",
          "„Tip”: cum răspunde utilizatorul (selectare unică / selectare multiplă / text / interval).",
          "„Activ”: dacă este „Da”, întrebarea apare utilizatorilor.",
          "„Editează” deschide editorul de întrebare (dialog).",
        ],
      },
      {
        title: "Editorul de întrebare (dialog)",
        bullets: [
          "Poți adăuga o întrebare nouă din „Adaugă întrebare” sau edita una existentă din tabel.",
          "Câmpuri: Cheie, Tip, Text întrebare, Ordine, Activ, Text de ajutor (opțional).",
          "Validare: „Obligatoriu”, iar pentru tipul „Interval” poți seta Minim/Maxim.",
          "Opțiuni (pentru tipurile de selectare): fie le gestionezi manual, fie se sincronizează din Vocabulary (dacă „Cheie” este din Vocabulary).",
          "Pentru chei din Vocabulary: opțiunile sunt „Gestionat în Vocabulary”, poți „Reîncarcă din Vocabulary” sau „Deschide Vocabulary”.",
          "Din editor poți și șterge o întrebare (butonul „Șterge”, când editezi o întrebare existentă).",
        ],
      },
      {
        title: "Note",
        notes: [
          "După „Salvează chestionarul” sau după salvarea unei întrebări, lista se recitește și se actualizează.",
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
        paragraphs: [
          "Creezi un produs nou pentru recomandări. Poți să îl adaugi manual sau să îl imporți din PrestaShop.",
        ],
      },
      {
        title: "Sursă (Manual / PrestaShop)",
        paragraphs: [
          "Manual: completezi câmpurile și (opțional) încarci imagini în Firebase Storage.",
          "PrestaShop: cauți un produs, îl selectezi, iar formularul se completează automat cu detalii (nume, preț, imagini).",
        ],
        bullets: [
          "„Caută produs” deschide selectorul pentru import.",
          "Dacă produsul este deja importat, vei vedea mesajul și poți apăsa „Deschide produsul”.",
        ],
      },
      {
        title: "Câmpuri importante",
        bullets: [
          "Activ: dacă este activ, produsul poate fi folosit în recomandări.",
          "Nume / Brand: datele afișate în listă și în selectoarele de produse.",
          "Preț + Monedă: valori folosite la afișare și în regulile de buget (dacă există).",
          "Atribute (Control/Rotire/Viteză/Greutate): informații opționale, utile în analiză și viitoare filtrări.",
        ],
      },
      {
        title: "Reguli recomandare",
        paragraphs: ["Poți adăuga una sau mai multe reguli (scenarii) care spun când produsul este recomandat."],
        bullets: [
          "Fiecare regulă are: Activ, Ordine, condiții (Nivel/Stil/Distanță/Prioritate) și o „Explicație”.",
          "„Adaugă regulă” creează o regulă nouă; „Editează” deschide dialogul; „Șterge” elimină regula.",
        ],
      },
      {
        title: "Imagini produs",
        bullets: [
          "Manual: poți adăuga poze (upload). Încărcarea efectivă în Firebase se face la „Salvează produsul”.",
          "Poți elimina poze înainte de salvare (ne-salvate) sau poți marca poze existente pentru ștergere (se șterg după salvare).",
          "PrestaShop: imaginile sunt preluate ca URL-uri (nu sunt încărcate în Firebase). Le poți deschide într-un tab nou din previzualizare.",
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

  "questionnaire-completions.list": {
    title: "Ajutor — Chestionare completate (Listă)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Vezi istoricul completărilor de chestionar: date de contact, utilizator (anonim/autentificat), dacă există o cerere către specialist și câte produse au fost recomandate.",
        ],
      },
      {
        title: "Filtre",
        bullets: [
          "Chestionar: restrânge lista la un chestionar anume.",
          "De la data / Până la data: filtrează după intervalul în care au fost create completările.",
          "„Aplică filtre” folosește valorile curente din filtre; „Șterge” revine la toate.",
        ],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Selectează un chestionar și un interval de timp, apoi apasă „Aplică filtre”.",
          "Apasă „Vezi” pentru a deschide detaliile unei completări (răspunsuri + recomandări).",
          "Folosește „Reîmprospătează” și „Încarcă mai multe” pentru a actualiza lista.",
        ],
      },
      {
        title: "Note",
        notes: [
          "Intervalul de timp este interpretat la începutul zilei (00:00) pentru datele selectate.",
          "Dacă nu apar rezultate, verifică filtrele sau apasă „Șterge”.",
        ],
      },
    ],
  },

  "questionnaire-completions.detail": {
    title: "Ajutor — Chestionar completat (Detalii)",
    sections: [
      {
        title: "Ce vezi aici",
        paragraphs: [
          "Detaliile unei completări: datele utilizatorului, răspunsurile (ordonate după „order” acolo unde există întrebarea), produsele recomandate și (dacă există) link către cererea către specialist asociată.",
        ],
      },
      {
        title: "Recomandări și cerere specialist",
        bullets: [
          "Recomandările listate sunt cele salvate pe completare la momentul calculului.",
          "Dacă există „Cerere specialist”, poți deschide direct cererea pentru a răspunde/actualiza statusul.",
        ],
      },
      {
        title: "Note",
        notes: [
          "Dacă vezi etichete de întrebare ca ID, înseamnă că întrebarea nu mai există (a fost ștearsă/renumită) sau nu s-a putut încărca.",
        ],
      },
    ],
  },

  vocabulary: {
    title: "Ajutor — Vocabulary",
    sections: [
      {
        title: "Ce este Vocabulary",
        paragraphs: [
          "Vocabulary este dicționarul de valori (ex: Nivel/Stil/Distanță/Prioritate) folosit în chestionare și în regulile de recomandare ale produselor.",
        ],
      },
      {
        title: "Inițializare",
        paragraphs: [
          "Dacă vezi mesajul „Vocabulary nu este inițializat”, apasă „Initialize vocabulary” ca să fie create documentele necesare.",
        ],
      },
      {
        title: "Categorii și valori",
        bullets: [
          "Categorie: definește o cheie tehnică (key) și un set de valori (opțiuni) asociate.",
          "Valoare: are Label (text), Order (ordine) și Active (vizibilă).",
          "Order controlează ordinea în liste; Active controlează dacă apare utilizatorilor.",
        ],
      },
      {
        title: "Acțiuni",
        bullets: [
          "„Adaugă categorie” creează o categorie nouă.",
          "Butonul „+” din card adaugă o valoare în categoria respectivă.",
          "„Editează” modifică label/order/active (ID-ul tehnic rămâne neschimbat).",
          "„Șterge” elimină categoria/valoarea din Vocabulary fără să modifice datele deja salvate în produse/chestionare.",
          "„Reîmprospătează” recitește categoriile și valorile.",
        ],
      },
      {
        title: "Note",
        notes: [
          "„Adaugă valori inițiale” apare doar când nu există încă valori în Vocabulary (pentru instalări noi/seed).",
          "Cheile din Vocabulary pot fi folosite în editorul de întrebări; pentru aceste chei, opțiunile se pot sincroniza automat din Vocabulary.",
        ],
      },
    ],
  },
};
