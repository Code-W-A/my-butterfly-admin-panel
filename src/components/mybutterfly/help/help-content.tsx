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
  | "recommendation-rules"
  | "recommendations.test"
  | "requests.list"
  | "requests.detail"
  | "questionnaire-completions.list"
  | "questionnaire-completions.detail"
  | "settings"
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
          "Pentru debugging recomandări, folosește „Test recomandări” și verifică pragul minim (%) din Setări.",
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
          "Folosește săgețile și butoanele numerotate pentru navigare între pagini.",
          "Apasă „Șterge” pentru a elimina un chestionar (cu confirmare).",
        ],
      },
      { title: "Sorting", bullets: ["Antetele de tabel sunt sortabile (click pe coloană)."] },
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
          "Dacă ai multe chestionare, navighează între pagini din controalele de paginare.",
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
          "Antetele de tabel sunt sortabile (click pe coloană).",
        ],
      },
      {
        title: "Editorul de întrebare (dialog)",
        bullets: [
          "Poți adăuga o întrebare nouă din „Adaugă întrebare” sau edita una existentă din tabel.",
          "Câmpuri: Cheie, Tip, Text întrebare, Ordine, Activ, Text de ajutor (opțional).",
          "Auto-fill: dacă alegi o categorie din Vocabulary care are „Întrebare standard”, câmpul „Text întrebare” se completează automat (editabil).",
          "Auto-fill pentru „budget”: când alegi cheia budget, se completează automat textul „Care este bugetul tău?” (editabil).",
          "Validare: „Obligatoriu”, iar pentru tipul „Interval” poți seta Minim/Maxim.",
          "Opțiuni (pentru tipurile de selectare): fie le gestionezi manual, fie se sincronizează din Vocabulary (dacă „Cheie” este din Vocabulary).",
          "Pentru chei din Vocabulary: opțiunile sunt „Gestionat în Vocabulary”, poți „Reîncarcă din Vocabulary” sau „Deschide Vocabulary”.",
          "Întrebări condiționale: poți seta reguli de afișare (visibility rules) ca întrebarea să apară doar pentru anumite răspunsuri la o întrebare anterioară.",
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
      {
        title: "Ce faci aici",
        paragraphs: [
          "Gestionezi produsele folosite în recomandări: le creezi/editezi/ștergi, le imporți din PrestaShop și atribui reguli (scenarii).",
        ],
      },
      {
        title: "Căutare și filtre",
        bullets: ["Caută după nume sau brand.", "„Doar active” afișează doar produsele marcate ca active."],
      },
      {
        title: "Pași tipici",
        bullets: [
          "Apasă „Creează produs” pentru un produs nou.",
          "Apasă „Importă din PrestaShop” pentru a adăuga rapid produse din catalog.",
          "Apasă „Atribuire reguli” pentru a selecta reguli reutilizabile și a le adăuga (merge) pe produsele selectate.",
          "Folosește „Previzualizează” ca să vezi/editezi o regulă înainte de atribuirea pe produse.",
          "Folosește link-ul către „Reguli recomandări” ca să creezi rapid reguli noi reutilizabile.",
          "Apasă „Editează” pentru a modifica detaliile.",
          "Apasă „Șterge” pentru a elimina un produs (cu confirmare).",
          "Folosește „Reîmprospătează” pentru a reciti prima pagină.",
          "Folosește săgețile și butoanele numerotate pentru navigare între pagini.",
        ],
      },
      {
        title: "Import PrestaShop (listă)",
        bullets: [
          "Produsele deja importate sunt marcate ca „Deja importat” și nu pot fi selectate.",
          "Pentru duplicate, vei vedea un warning și un link către produsul existent (editare).",
        ],
      },
      {
        title: "Sorting",
        bullets: ["Antetele de tabel sunt sortabile (click pe coloană)."],
      },
      {
        title: "Note",
        notes: [
          "Atribuirea regulilor este de tip merge: adaugă reguli peste scenariile existente ale produselor.",
          "Dacă un produs nu apare la recomandări, verifică: Active (produs + scenarii), condițiile din reguli, bugetul (hard filter) și pragul minim (%) din Setări.",
        ],
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
          "Poți și importa reguli reutilizabile (din pagina „Reguli recomandări”), iar ele se adaugă prin merge în scenariile produsului.",
        ],
      },
      {
        title: "Buget și prag",
        notes: [
          "Bugetul este tratat ca un filtru strict (hard filter): dacă produsul nu se încadrează, nu apare indiferent de procent.",
          "Pragul minim (%) este configurabil în Setări și filtrează rezultatele sub acel procent.",
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
        paragraphs: [
          "Editezi produsul: activare, detalii, atribute, imagini și regulile/scenariile care îl fac eligibil pentru recomandări.",
        ],
      },
      {
        title: "Reguli (scenarii) pe produs",
        bullets: [
          "Poți avea mai multe scenarii pe un produs; fiecare scenariu are Activ/Ordine/Condiții/Explicație.",
          "Dacă mai multe scenarii se potrivesc, sistemul alege scenariul „cel mai bun” (de obicei cu matchPercent mai mare).",
          "Poți importa reguli reutilizabile și le poți combina cu cele deja existente (merge).",
        ],
      },
      {
        title: "Imagine produs",
        bullets: [
          "Dacă încarci o imagine nouă, aceasta va înlocui linkul de imagine salvat la produs.",
          "Dacă apare o eroare la încărcare, încearcă din nou sau verifică dacă ai acces de administrator.",
          "Pentru produse PrestaShop, imaginile pot fi doar URL-uri (nu upload în Firebase).",
        ],
      },
      {
        title: "Sfaturi de depanare",
        notes: [
          "Dacă produsul nu apare la recomandări: verifică Active (produs + scenarii), condițiile din scenarii, bugetul, și pragul minim (%) din Setări.",
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
          "Apasă „Șterge” pentru a elimina o cerere (cu confirmare).",
          "Folosește „Reîmprospătează” și controalele de paginare pentru listă.",
        ],
      },
      { title: "Sorting", bullets: ["Antetele de tabel sunt sortabile (click pe coloană)."] },
      {
        title: "Note",
        notes: ["Dacă ai multe cereri, navighează între pagini cu săgețile și butoanele numerotate."],
      },
    ],
  },

  "requests.detail": {
    title: "Ajutor — Cerere către specialist (Detalii + Răspuns)",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Analizezi răspunsurile utilizatorului și trimiți un răspuns cu produse recomandate + mesaj.",
          "Pagina afișează și potrivirea (%) pe produs și o secțiune dedicată pentru „Întrebări sărite”.",
        ],
      },
      {
        title: "Întrebări sărite",
        paragraphs: [
          "Întrebările pot fi sărite din cauza regulilor de afișare (visibility rules), a faptului că sunt inactive sau pentru că o întrebare pre-rechizită nu a fost completată.",
          "Întrebările sărite nu ar trebui să scadă procentul doar pentru că nu au fost afișate; potrivirea se calculează pe întrebările care chiar au fost afișate (askedQuestionIds).",
        ],
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
          "Apasă „Șterge” pentru a elimina o completare (cu confirmare).",
          "Folosește „Reîmprospătează” și controalele de paginare pentru a actualiza lista.",
        ],
      },
      { title: "Sorting", bullets: ["Antetele de tabel sunt sortabile (click pe coloană)."] },
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
        title: "Întrebări sărite",
        paragraphs: [
          "Vei vedea o secțiune dedicată pentru întrebările care nu au fost afișate/utilizate (ex: regula de afișare neîndeplinită, întrebare inactivă, prerequisite lipsă).",
          "Aceste informații te ajută să înțelegi de ce procentul de potrivire poate varia între sesiuni și de ce anumite condiții nu au fost luate în calcul.",
        ],
      },
      {
        title: "Recomandări și cerere specialist",
        bullets: [
          "Recomandările listate sunt cele salvate pe completare la momentul calculului.",
          "Dacă există „Cerere specialist”, poți deschide direct cererea pentru a răspunde/actualiza statusul.",
          "Badge-ul de potrivire (%) arată cât de bine se potrivește produsul cu răspunsurile (pe întrebările afișate).",
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

  "recommendation-rules": {
    title: "Ajutor — Reguli recomandări",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Creezi și gestionezi reguli reutilizabile (o regulă = un scenariu) pe care le poți importa/atribui rapid la produse.",
          "Gândește-te la ele ca „template-uri” de reguli: le definești o dată și le aplici la mai multe produse (merge).",
        ],
      },
      {
        title: "Regula (scenariul) conține",
        bullets: [
          "Activ: dacă e oprită, nu ar trebui folosită la recomandări când e importată pe produse (în funcție de scenariile produsului).",
          "Order (ordine): folosită la prioritizare când există mai multe reguli/scenarii pe același produs.",
          "Condiții: bazate pe chei din Vocabulary și alte chei de chestionar (ex: level/style/distance/priority/preferences/budget).",
          "Explicație: textul afișat utilizatorului (de ce a fost recomandat produsul).",
        ],
      },
      {
        title: "Cum legi reguli de produse și pachete",
        bullets: [
          "„Leagă produse” te duce în lista de produse cu dialogul de atribuire, ca să selectezi produsele țintă.",
          "„Leagă pachete” te duce în creare pachet cu regula presetată pentru import direct în scenarii.",
          "Atribuirea/importul este de tip merge: regulile selectate se adaugă peste scenariile existente ale produsului/pachetului (nu șterg automat).",
          "Poți previzualiza și edita o regulă înainte de atribuire (din dialogul de previzualizare din Produse).",
        ],
      },
      {
        title: "Sfaturi",
        notes: [
          "Păstrează condițiile cât mai clare și evită combinații prea restrictive; potrivirea este procentuală, dar pragul minim poate filtra rezultate.",
          "Folosește titluri descriptive (ex: „Offensive + mid distance”, „Beginner control”, etc.).",
        ],
      },
    ],
  },

  settings: {
    title: "Ajutor — Setări",
    sections: [
      {
        title: "Ce faci aici",
        paragraphs: [
          "Configurezi comportamentul recomandărilor la nivel de aplicație.",
          "Poți seta pragul minim de potrivire (%), cursul EUR→RON și TVA-ul folosit la conversia prețurilor PrestaShop.",
        ],
      },
      {
        title: "Potrivire minimă (%)",
        paragraphs: [
          "Produsele sunt evaluate cu un matchPercent (0–100). Vor fi afișate toate produsele care au matchPercent peste pragul setat.",
          "Pragul nu este „top N”: nu există limită top 5; ordonarea se face după procentul de potrivire (și apoi criterii interne).",
        ],
      },
      {
        title: "Pricing PrestaShop",
        paragraphs: [
          "La importul PrestaShop, prețul EUR este convertit în RON cu formula: EUR × curs × (1 + TVA/100).",
          "Rotunjirea este de tip half-up: la .5 se rotunjește în sus (fără zecimale).",
        ],
      },
      {
        title: "Recalculare prețuri",
        paragraphs: [
          "Butonul „Recalculează prețuri PrestaShop (RON)” actualizează manual produsele existente importate din PrestaShop care au moneda RON.",
          "Operația nu rulează automat la salvarea setărilor și afișează un rezumat: scanate/actualizate/ignorate/eșuate.",
        ],
      },
      {
        title: "Depanare",
        notes: [
          "Dacă nu apar produse, verifică pragul și folosește „Test recomandări” + butonul Debug (dacă e activ) ca să vezi exact de ce un produs a fost filtrat.",
        ],
      },
    ],
  },

  "recommendations.test": {
    title: "Ajutor — Test recomandări",
    sections: [
      {
        title: "Ce este această pagină",
        paragraphs: [
          "Este o simulare completă a fluxului de recomandări din aplicația mobilă, direct din admin: răspunzi la chestionar și vezi rezultatele (cu matchPercent).",
          "Pagina te ajută să validezi rapid că regulile și întrebările produc rezultatele așteptate.",
        ],
      },
      {
        title: "Tab-uri",
        bullets: [
          "Chestionar: alegi chestionarul, răspunzi la întrebări și finalizezi sesiunea.",
          "Rezultate: lista produselor recomandate peste pragul minim, sortate după matchPercent.",
          "Favorite: salvezi produse ca favorite pentru comparații.",
          "Istoric: sesiuni rulate anterior (util pentru regression testing).",
        ],
      },
      {
        title: "Cum se calculează potrivirea",
        paragraphs: [
          "Potrivirea este procentuală și se calculează pe condițiile relevante pentru întrebările care chiar au fost afișate utilizatorului (askedQuestionIds).",
          "Întrebările condiționale care nu au fost afișate sunt marcate ca „sărite” și nu ar trebui să scadă procentul prin faptul că nu au răspuns.",
        ],
      },
      {
        title: "Întrebări sărite",
        bullets: [
          "rule_not_met: regula de afișare nu a fost îndeplinită.",
          "inactive: întrebarea a fost inactivă.",
          "prerequisite_not_answered: întrebarea depinde de o altă întrebare la care nu s-a răspuns.",
        ],
      },
      {
        title: "Debug (doar când NEXT_PUBLIC_DEBUG e activ)",
        paragraphs: [
          "Butonul flotant „Debug” deschide un dialog cu detalii despre calcul: input-uri, prag, breakdown pe produs și pe condiții, plus explicația despre „scenariul ales” când un produs are mai multe scenarii potrivite.",
        ],
      },
      {
        title: "Sfaturi",
        notes: [
          "Dacă un produs nu apare, verifică: Active (produs + scenariu), condițiile (valorile exacte), bugetul (hard filter), și pragul minim din Setări.",
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
          "Întrebare standard: text predefinit care se completează automat în editorul de întrebări când alegi categoria.",
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
