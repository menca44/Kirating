// =========================================================
// IMPORTAZIONE DEI MODULI
// =========================================================

// Express serve per creare il server web e le rotte.
const express = require("express");

// Path serve per indicare correttamente la cartella public.
const path = require("path");

// mysql2/promise permette di usare MySQL con async e await.
const mysql = require("mysql2/promise");

// Carica le variabili presenti nel file .env.
require("dotenv").config();


// =========================================================
// CREAZIONE DEL SERVER
// =========================================================

// Crea l'applicazione Express.
const app = express();

// Railway assegna una porta automaticamente.
// In locale viene usata la porta 3000.
const PORT = process.env.PORT || 3000;


// =========================================================
// MIDDLEWARE
// =========================================================

// Permette al server di leggere dati JSON.
app.use(express.json());

// Permette al server di leggere dati provenienti dai form HTML.
app.use(express.urlencoded({ extended: true }));

// Rende accessibili i file presenti dentro public.
app.use(express.static(path.join(__dirname, "public")));


// =========================================================
// COLLEGAMENTO AL DATABASE
// =========================================================

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Mantiene disponibili più connessioni.
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


// =========================================================
// CREAZIONE DELLE TABELLE
// =========================================================

async function inizializzaDatabase() {
  /*
    Tabella degli utenti.

    Contiene:
    - nome;
    - email;
    - password;
    - data di registrazione.
  */
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Tabella users pronta.");

  /*
    Tabella dei ristoranti.

    latitude e longitude servono per posizionare
    il ristorante sulla mappa.
  */
  await db.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      region VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL,
      address VARCHAR(255) NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      cuisine VARCHAR(100),
      description TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_restaurant_user
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);

  console.log("Tabella restaurants pronta.");
}


// =========================================================
// REGISTRAZIONE UTENTE
// =========================================================

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Controlla che siano presenti tutti i campi obbligatori.
  if (!name || !email || !password) {
    return res.status(400).send("Compila tutti i campi.");
  }

  try {
    await db.query(
      `
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
      `,
      [name, email, password]
    );

    res.send("Registrazione completata.");
  } catch (error) {
    console.error("Errore durante la registrazione:", error);

    // MySQL restituisce ER_DUP_ENTRY se l'email esiste già.
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).send("Email già registrata.");
    }

    res.status(500).send("Errore durante la registrazione.");
  }
});


// =========================================================
// LOGIN UTENTE
// =========================================================

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Inserisci email e password.");
  }

  try {
    const [users] = await db.query(
      `
        SELECT id, name, email
        FROM users
        WHERE email = ? AND password = ?
      `,
      [email, password]
    );

    // Nessun utente trovato con quelle credenziali.
    if (users.length === 0) {
      return res.status(401).send("Email o password errati.");
    }

    res.json({
      success: true,
      message: "Login effettuato correttamente.",
      user: users[0]
    });
  } catch (error) {
    console.error("Errore durante il login:", error);

    res.status(500).send("Errore durante il login.");
  }
});


// =========================================================
// RECUPERO DEI RISTORANTI
// =========================================================

app.get("/restaurants", async (req, res) => {
  /*
    Legge il parametro region dall'indirizzo.

    Esempio:
    /restaurants?region=Lazio
  */
  const region = req.query.region;

  try {
    let query;
    let values = [];

    /*
      Se la regione è stata specificata,
      restituisce solo i ristoranti di quella regione.
    */
    if (region) {
      query = `
        SELECT
          id,
          name,
          region,
          city,
          address,
          latitude,
          longitude,
          cuisine,
          description,
          created_by,
          created_at
        FROM restaurants
        WHERE LOWER(region) = LOWER(?)
        ORDER BY name ASC
      `;

      values = [region];
    } else {
      /*
        Se non viene specificata alcuna regione,
        restituisce tutti i ristoranti.
      */
      query = `
        SELECT
          id,
          name,
          region,
          city,
          address,
          latitude,
          longitude,
          cuisine,
          description,
          created_by,
          created_at
        FROM restaurants
        ORDER BY region ASC, name ASC
      `;
    }

    // Esegue la query costruita sopra.
    const [restaurants] = await db.query(query, values);

    // Restituisce i risultati in formato JSON.
    res.json(restaurants);
  } catch (error) {
    console.error(
      "Errore durante il recupero dei ristoranti:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Errore durante il recupero dei ristoranti."
    });
  }
});


// =========================================================
// AVVIO DEL SERVER
// =========================================================

async function avviaServer() {
  try {
    // Verifica che il database sia raggiungibile.
    await db.query("SELECT 1");

    console.log("Connessione al database riuscita.");

    // Crea le tabelle mancanti.
    await inizializzaDatabase();

    // Avvia il server.
    app.listen(PORT, () => {
      console.log(
        `Server avviato su http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Impossibile avviare il server:",
      error
    );
  }
}

// Avvia tutta l'applicazione.
avviaServer();