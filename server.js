// =========================================================
// IMPORTAZIONE DEI MODULI
// =========================================================

const express = require("express");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");

require("dotenv").config();


// =========================================================
// CREAZIONE DELL'APPLICAZIONE
// =========================================================

const app = express();

const PORT = process.env.PORT || 3000;


// =========================================================
// CARTELLA DELLE FOTOGRAFIE
// =========================================================

const uploadsDirectory =
  process.env.UPLOADS_PATH ||
  path.join(__dirname, "uploads");

fs.mkdirSync(uploadsDirectory, {
  recursive: true
});


// =========================================================
// MIDDLEWARE GENERALI
// =========================================================

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.use(
  "/uploads",
  express.static(uploadsDirectory)
);


// =========================================================
// SESSIONE UTENTE
// =========================================================

/*
  La sessione permette al server di ricordare
  che un utente ha fatto login.

  In produzione sarebbe meglio usare un session store
  collegato al database. Per ora va bene per sviluppo locale.
*/
app.use(
  session({
    name: "kirating.sid",

    secret:
      process.env.SESSION_SECRET ||
      "cambia-questa-chiave-segreta-kirating",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      /*
        In locale secure deve essere false,
        perché usiamo http://localhost.
      */
      secure: false,

      sameSite: "lax",

      /*
        La sessione dura 7 giorni.
      */
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);


// =========================================================
// COLLEGAMENTO AL DATABASE
// =========================================================

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


// =========================================================
// CONFIGURAZIONE DI MULTER
// =========================================================

const photoStorage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, uploadsDirectory);
  },

  filename: function (req, file, callback) {
    const originalExtension =
      path.extname(file.originalname).toLowerCase();

    const uniqueName =
      "review-" +
      Date.now() +
      "-" +
      Math.round(Math.random() * 1_000_000_000) +
      originalExtension;

    callback(null, uniqueName);
  }
});


function photoFileFilter(req, file, callback) {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    callback(null, true);
    return;
  }

  const error = new Error(
    "Sono consentite soltanto immagini JPG, PNG o WebP."
  );

  error.code = "INVALID_FILE_TYPE";

  callback(error);
}


const uploadReviewPhotos = multer({
  storage: photoStorage,

  fileFilter: photoFileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  }
});


// =========================================================
// FUNZIONI DI UTILITÀ
// =========================================================

async function deleteUploadedFiles(files) {
  if (!Array.isArray(files)) {
    return;
  }

  const deletionOperations = files.map(
    async function (file) {
      try {
        await fs.promises.unlink(file.path);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(
            "Errore durante la cancellazione del file:",
            error
          );
        }
      }
    }
  );

  await Promise.all(deletionOperations);
}


function parseIntegerInRange(
  value,
  minimum,
  maximum
) {
  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    return null;
  }

  return parsedValue;
}


function cleanText(value) {
  return String(value || "").trim();
}


/*
  Middleware che controlla se l'utente è loggato.

  Se non è loggato, blocca la richiesta.
*/
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message:
        "Devi effettuare l'accesso per eseguire questa operazione."
    });
  }

  next();
}


// =========================================================
// CREAZIONE / AGGIORNAMENTO DELLE TABELLE
// =========================================================

async function inizializzaDatabase() {
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      restaurant_id INT NOT NULL,
      user_id INT NULL,
      food_rating TINYINT NOT NULL,
      service_rating TINYINT NOT NULL,
      atmosphere_rating TINYINT NOT NULL,
      overall_rating TINYINT NOT NULL,
      price_range TINYINT NOT NULL,
      experience TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_review_restaurant
        FOREIGN KEY (restaurant_id)
        REFERENCES restaurants(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_review_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

      CONSTRAINT chk_food_rating
        CHECK (food_rating BETWEEN 1 AND 5),

      CONSTRAINT chk_service_rating
        CHECK (service_rating BETWEEN 1 AND 5),

      CONSTRAINT chk_atmosphere_rating
        CHECK (atmosphere_rating BETWEEN 1 AND 5),

      CONSTRAINT chk_overall_rating
        CHECK (overall_rating BETWEEN 1 AND 5),

      CONSTRAINT chk_price_range
        CHECK (price_range BETWEEN 1 AND 4)
    )
  `);

  console.log("Tabella reviews pronta.");

  await db.query(`
    CREATE TABLE IF NOT EXISTS review_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      review_id INT NOT NULL,
      photo_url VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_photo_review
        FOREIGN KEY (review_id)
        REFERENCES reviews(id)
        ON DELETE CASCADE
    )
  `);

  console.log("Tabella review_photos pronta.");
}


// =========================================================
// REGISTRAZIONE UTENTE
// =========================================================

app.post("/register", async (req, res) => {
  const name = cleanText(req.body.name);
  const email = cleanText(req.body.email).toLowerCase();
  const password = cleanText(req.body.password);

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Compila tutti i campi."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message:
        "La password deve contenere almeno 6 caratteri."
    });
  }

  try {
    /*
      Cripta la password prima di salvarla.
      Nel database non verrà più salvata la password in chiaro.
    */
    const hashedPassword =
      await bcrypt.hash(password, 12);

    await db.query(
      `
        INSERT INTO users (
          name,
          email,
          password
        )
        VALUES (?, ?, ?)
      `,
      [
        name,
        email,
        hashedPassword
      ]
    );

    res.status(201).json({
      success: true,
      message: "Registrazione completata."
    });
  } catch (error) {
    console.error(
      "Errore durante la registrazione:",
      error
    );

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email già registrata."
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Errore durante la registrazione."
    });
  }
});


// =========================================================
// LOGIN UTENTE
// =========================================================

app.post("/login", async (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const password = cleanText(req.body.password);

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Inserisci email e password."
    });
  }

  try {
    const [users] = await db.query(
      `
        SELECT
          id,
          name,
          email,
          password
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Email o password errati."
      });
    }

    const user = users[0];

    /*
      Confronta la password scritta
      con quella criptata nel database.
    */
    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Email o password errati."
      });
    }

    /*
      Salva nella sessione solo dati non sensibili.
      La password non viene mai messa in sessione.
    */
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    res.json({
      success: true,
      message:
        "Login effettuato correttamente.",
      user: req.session.user
    });
  } catch (error) {
    console.error(
      "Errore durante il login:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Errore durante il login."
    });
  }
});


// =========================================================
// UTENTE ATTUALMENTE LOGGATO
// =========================================================

app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.json({
      success: true,
      authenticated: false,
      user: null
    });
  }

  res.json({
    success: true,
    authenticated: true,
    user: req.session.user
  });
});


// =========================================================
// LOGOUT
// =========================================================

app.post("/logout", (req, res) => {
  req.session.destroy(function (error) {
    if (error) {
      console.error(
        "Errore durante il logout:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Non è stato possibile effettuare il logout."
      });
    }

    res.clearCookie("kirating.sid");

    res.json({
      success: true,
      message: "Logout effettuato correttamente."
    });
  });
});


// =========================================================
// RECUPERO DEI RISTORANTI
// =========================================================

app.get("/restaurants", async (req, res) => {
  const region = cleanText(req.query.region);

  try {
    let query;
    let values = [];

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

    const [restaurants] =
      await db.query(query, values);

    res.json(restaurants);
  } catch (error) {
    console.error(
      "Errore durante il recupero dei ristoranti:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Errore durante il recupero dei ristoranti."
    });
  }
});


// =========================================================
// DETTAGLI DI UN SINGOLO RISTORANTE
// =========================================================

app.get("/restaurants/:id", async (req, res) => {
  const restaurantId =
    Number.parseInt(req.params.id, 10);

  if (
    !Number.isInteger(restaurantId) ||
    restaurantId <= 0
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Identificativo del ristorante non valido."
    });
  }

  try {
    const [restaurants] = await db.query(
      `
        SELECT
          r.id,
          r.name,
          r.region,
          r.city,
          r.address,
          r.latitude,
          r.longitude,
          r.cuisine,
          r.description,
          r.created_at,

          COUNT(rv.id) AS reviews_count,

          ROUND(AVG(rv.food_rating), 1)
            AS average_food_rating,

          ROUND(AVG(rv.service_rating), 1)
            AS average_service_rating,

          ROUND(AVG(rv.atmosphere_rating), 1)
            AS average_atmosphere_rating,

          ROUND(AVG(rv.overall_rating), 1)
            AS average_overall_rating,

          ROUND(AVG(rv.price_range), 1)
            AS average_price_range

        FROM restaurants r

        LEFT JOIN reviews rv
          ON rv.restaurant_id = r.id

        WHERE r.id = ?

        GROUP BY
          r.id,
          r.name,
          r.region,
          r.city,
          r.address,
          r.latitude,
          r.longitude,
          r.cuisine,
          r.description,
          r.created_at
      `,
      [restaurantId]
    );

    if (restaurants.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ristorante non trovato."
      });
    }

    const [reviews] = await db.query(
      `
        SELECT
          rv.id,
          rv.food_rating,
          rv.service_rating,
          rv.atmosphere_rating,
          rv.overall_rating,
          rv.price_range,
          rv.experience,
          rv.created_at,

          u.id AS user_id,

          COALESCE(
            u.name,
            'Utente anonimo'
          ) AS user_name

        FROM reviews rv

        LEFT JOIN users u
          ON u.id = rv.user_id

        WHERE rv.restaurant_id = ?

        ORDER BY rv.created_at DESC
      `,
      [restaurantId]
    );

    const [photos] = await db.query(
      `
        SELECT
          rp.id,
          rp.review_id,
          rp.photo_url,
          rp.created_at

        FROM review_photos rp

        INNER JOIN reviews rv
          ON rv.id = rp.review_id

        WHERE rv.restaurant_id = ?

        ORDER BY rp.created_at DESC
      `,
      [restaurantId]
    );

    const reviewsWithPhotos = reviews.map(
      function (review) {
        const reviewPhotos = photos
          .filter(function (photo) {
            return photo.review_id === review.id;
          })
          .map(function (photo) {
            return {
              id: photo.id,
              url: photo.photo_url
            };
          });

        return {
          ...review,
          photos: reviewPhotos
        };
      }
    );

    const restaurant = restaurants[0];

    res.json({
      success: true,

      restaurant: {
        ...restaurant,

        latitude:
          Number(restaurant.latitude),

        longitude:
          Number(restaurant.longitude),

        reviews_count:
          Number(restaurant.reviews_count),

        average_food_rating:
          restaurant.average_food_rating === null
            ? null
            : Number(restaurant.average_food_rating),

        average_service_rating:
          restaurant.average_service_rating === null
            ? null
            : Number(restaurant.average_service_rating),

        average_atmosphere_rating:
          restaurant.average_atmosphere_rating === null
            ? null
            : Number(restaurant.average_atmosphere_rating),

        average_overall_rating:
          restaurant.average_overall_rating === null
            ? null
            : Number(restaurant.average_overall_rating),

        average_price_range:
          restaurant.average_price_range === null
            ? null
            : Number(restaurant.average_price_range)
      },

      reviews: reviewsWithPhotos
    });
  } catch (error) {
    console.error(
      "Errore durante il recupero del ristorante:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Non è stato possibile recuperare il ristorante."
    });
  }
});


// =========================================================
// RICERCA DI UNA POSIZIONE
// =========================================================

app.get("/geocode", async (req, res) => {
  const searchText =
    cleanText(req.query.q);

  if (searchText.length < 3) {
    return res.status(400).json({
      success: false,
      message:
        "Inserisci una posizione di almeno 3 caratteri."
    });
  }

  try {
    const nominatimUrl =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      "&limit=1" +
      "&countrycodes=it" +
      "&q=" +
      encodeURIComponent(searchText);

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent":
          "KiRating/1.0 restaurant-map-application",

        "Referer":
          process.env.APP_URL ||
          "http://localhost:3000",

        "Accept-Language": "it"
      }
    });

    if (!response.ok) {
      throw new Error(
        "Nominatim ha restituito lo stato " +
        response.status
      );
    }

    const results = await response.json();

    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: "Posizione non trovata."
      });
    }

    const result = results[0];

    res.json({
      success: true,

      location: {
        displayName: result.display_name,
        latitude: Number(result.lat),
        longitude: Number(result.lon)
      }
    });
  } catch (error) {
    console.error(
      "Errore durante la ricerca della posizione:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Non è stato possibile cercare la posizione."
    });
  }
});


// =========================================================
// RISTORANTI VICINI
// =========================================================

app.get("/restaurants/nearby", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  const radius = Number(req.query.radius || 10);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return res.status(400).json({
      success: false,
      message: "Coordinate non valide."
    });
  }

  if (
    !Number.isFinite(radius) ||
    radius < 1 ||
    radius > 100
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Il raggio deve essere compreso tra 1 e 100 km."
    });
  }

  try {
    const [restaurants] = await db.query(
      `
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
          created_at,

          (
            6371 * ACOS(
              LEAST(
                1,

                COS(RADIANS(?))
                * COS(RADIANS(latitude))
                * COS(
                    RADIANS(longitude)
                    - RADIANS(?)
                  )

                + SIN(RADIANS(?))
                * SIN(RADIANS(latitude))
              )
            )
          ) AS distance_km

        FROM restaurants

        HAVING distance_km <= ?

        ORDER BY distance_km ASC
      `,
      [
        latitude,
        longitude,
        latitude,
        radius
      ]
    );

    const formattedRestaurants =
      restaurants.map(function (restaurant) {
        return {
          ...restaurant,

          distance_km:
            Number(
              Number(
                restaurant.distance_km
              ).toFixed(2)
            )
        };
      });

    res.json(formattedRestaurants);
  } catch (error) {
    console.error(
      "Errore durante la ricerca dei ristoranti vicini:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Non è stato possibile cercare i ristoranti vicini."
    });
  }
});


// =========================================================
// INSERIMENTO DI UNA RECENSIONE
// =========================================================

/*
  Qui c'è requireLogin.

  Quindi la recensione può essere pubblicata
  solo da un utente che ha fatto login.
*/
app.post(
  "/reviews",

  requireLogin,

  uploadReviewPhotos.array("photos", 5),

  async function (req, res) {
    const restaurantName =
      cleanText(req.body.restaurant_name);

    const region =
      cleanText(req.body.region);

    const city =
      cleanText(req.body.city);

    const address =
      cleanText(req.body.address);

    const cuisine =
      cleanText(req.body.cuisine);

    const latitude =
      Number(req.body.latitude);

    const longitude =
      Number(req.body.longitude);

    const experience =
      cleanText(req.body.experience);

    /*
      L'userId non viene più preso dal form.
      Viene preso dalla sessione.
    */
    const userId =
      req.session.user.id;

    const foodRating =
      parseIntegerInRange(
        req.body.food_rating,
        1,
        5
      );

    const serviceRating =
      parseIntegerInRange(
        req.body.service_rating,
        1,
        5
      );

    const atmosphereRating =
      parseIntegerInRange(
        req.body.atmosphere_rating,
        1,
        5
      );

    const overallRating =
      parseIntegerInRange(
        req.body.overall_rating,
        1,
        5
      );

    const priceRange =
      parseIntegerInRange(
        req.body.price_range,
        1,
        4
      );

    const missingRequiredText =
      !restaurantName ||
      !region ||
      !city ||
      !address ||
      !experience;

    const invalidCoordinates =
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude);

    const invalidRatings =
      foodRating === null ||
      serviceRating === null ||
      atmosphereRating === null ||
      overallRating === null ||
      priceRange === null;

    if (
      missingRequiredText ||
      invalidCoordinates ||
      invalidRatings
    ) {
      await deleteUploadedFiles(req.files);

      return res.status(400).json({
        success: false,
        message:
          "Controlla i dati inseriti nel modulo."
      });
    }

    const connection =
      await db.getConnection();

    try {
      await connection.beginTransaction();

      const [existingRestaurants] =
        await connection.query(
          `
            SELECT id
            FROM restaurants
            WHERE LOWER(name) = LOWER(?)
              AND LOWER(city) = LOWER(?)
              AND LOWER(address) = LOWER(?)
            LIMIT 1
          `,
          [
            restaurantName,
            city,
            address
          ]
        );

      let restaurantId;

      if (existingRestaurants.length > 0) {
        restaurantId =
          existingRestaurants[0].id;
      } else {
        const [restaurantResult] =
          await connection.query(
            `
              INSERT INTO restaurants (
                name,
                region,
                city,
                address,
                latitude,
                longitude,
                cuisine,
                description,
                created_by
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              restaurantName,
              region,
              city,
              address,
              latitude,
              longitude,
              cuisine || null,
              null,
              userId
            ]
          );

        restaurantId =
          restaurantResult.insertId;
      }

      const [reviewResult] =
        await connection.query(
          `
            INSERT INTO reviews (
              restaurant_id,
              user_id,
              food_rating,
              service_rating,
              atmosphere_rating,
              overall_rating,
              price_range,
              experience
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            restaurantId,
            userId,
            foodRating,
            serviceRating,
            atmosphereRating,
            overallRating,
            priceRange,
            experience
          ]
        );

      const reviewId =
        reviewResult.insertId;

      if (
        Array.isArray(req.files) &&
        req.files.length > 0
      ) {
        const photoValues =
          req.files.map(function (file) {
            return [
              reviewId,
              "/uploads/" + file.filename
            ];
          });

        await connection.query(
          `
            INSERT INTO review_photos (
              review_id,
              photo_url
            )
            VALUES ?
          `,
          [photoValues]
        );
      }

      await connection.commit();

      res.status(201).json({
        success: true,

        message:
          "Recensione pubblicata correttamente.",

        review: {
          id: reviewId,
          restaurantId: restaurantId,

          photos:
            Array.isArray(req.files)
              ? req.files.map(function (file) {
                  return (
                    "/uploads/" +
                    file.filename
                  );
                })
              : []
        }
      });
    } catch (error) {
      await connection.rollback();

      await deleteUploadedFiles(req.files);

      console.error(
        "Errore durante il salvataggio della recensione:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Non è stato possibile pubblicare la recensione."
      });
    } finally {
      connection.release();
    }
  }
);


// =========================================================
// GESTIONE DEGLI ERRORI DI MULTER
// =========================================================

app.use(async function (
  error,
  req,
  res,
  next
) {
  await deleteUploadedFiles(req.files);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message:
          "Ogni fotografia deve pesare al massimo 5 MB."
      });
    }

    if (
      error.code === "LIMIT_FILE_COUNT" ||
      error.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Puoi caricare al massimo 5 fotografie."
      });
    }

    return res.status(400).json({
      success: false,
      message:
        "Errore durante il caricamento delle fotografie."
    });
  }

  if (error.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      success: false,
      message:
        "Sono consentite soltanto immagini JPG, PNG o WebP."
    });
  }

  console.error(
    "Errore non gestito:",
    error
  );

  res.status(500).json({
    success: false,
    message:
      "Si è verificato un errore interno."
  });
});


// =========================================================
// AVVIO DEL SERVER
// =========================================================

async function avviaServer() {
  try {
    await db.query("SELECT 1");

    console.log(
      "Connessione al database riuscita."
    );

    await inizializzaDatabase();

    app.listen(PORT, function () {
      console.log(
        `Server avviato su http://localhost:${PORT}`
      );

      console.log(
        `Cartella fotografie: ${uploadsDirectory}`
      );
    });
  } catch (error) {
    console.error(
      "Impossibile avviare il server:",
      error
    );
  }
}

avviaServer();