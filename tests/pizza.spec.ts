import { Page } from "@playwright/test";
import { test, expect } from "playwright-test-coverage";
import { Role, User } from "../src/service/pizzaService";

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    "d@jwt.com": {
      id: "3",
      name: "Kai Chen",
      email: "d@jwt.com",
      password: "a",
      roles: [{ role: Role.Diner }],
    },
    "f@jwt.com": {
      id: "4",
      name: "Jared Franchisee",
      email: "f@jwt.com",
      password: "franchisee",
      roles: [{ role: Role.Diner }, { role: Role.Franchisee, objectId: "1" }],
    },
    "a@jwt.com": {
      id: "5",
      name: "Aaron Admin",
      email: "a@jwt.com",
      password: "admin",
      roles: [{ role: Role.Admin }],
    },
  };

  let mockStores = [
    { id: 1, name: "Lehi", totalRevenue: 1200.5 },
    { id: 2, name: "Provo", totalRevenue: 850.0 },
  ];

  let mockFranchises = [
    {
      id: 2,
      name: "LotaPizza",
      stores: [
        { id: 4, name: "Lehi" },
        { id: 5, name: "Springville" },
        { id: 6, name: "American Fork" },
      ],
    },
    { id: 3, name: "PizzaCorp", stores: [{ id: 7, name: "Spanish Fork" }] },
    { id: 4, name: "topSpot", stores: [] },
  ];

  // Register
  await page.route("*/**/api/auth", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }

    const body = route.request().postDataJSON();

    const newId = (Object.keys(validUsers).length + 10).toString();

    loggedInUser = {
      id: newId,
      name: body.name,
      email: body.email,
      password: body.password,
      roles: [{ role: Role.Diner }],
    };

    validUsers[body.email] = loggedInUser;

    await route.fulfill({ json: { user: loggedInUser, token: "abcdef" } });
  });

  // Authorize login for the given user
  await page.route("*/**/api/auth", async (route) => {
    if (route.request().method() !== "PUT") {
      return route.fallback();
    }

    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: "abcdef",
    };
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({ json: loginRes });
  });

  // Return the currently logged in user
  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  // A standard menu
  await page.route("*/**/api/order/menu", async (route) => {
    const menuRes = [
      {
        id: 1,
        title: "Veggie",
        image: "pizza1.png",
        price: 0.0038,
        description: "A garden of delight",
      },
      {
        id: 2,
        title: "Pepperoni",
        image: "pizza2.png",
        price: 0.0042,
        description: "Spicy treat",
      },
    ];
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: menuRes });
  });

  // Standard franchises and stores
  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const franchiseRes = {
      franchises: mockFranchises,
    };
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: franchiseRes });
  });

  // Add franchises
  await page.route(/\/api\/franchise$/, async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }

    const requestBody = route.request().postDataJSON();
    const newFranchise = {
      id: Math.floor(Math.random() * 1000),
      name: requestBody.name,
      admins: [{ id: 5, name: "Aaron Admin", email: "a@jwt.com" }],
      stores: [],
    };

    mockFranchises.push(newFranchise);

    await route.fulfill({
      status: 200,
      json: newFranchise,
    });
  });

  // Delete franchise
  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    if (route.request().method() !== "DELETE") {
      return route.fallback();
    }

    const urlParts = route.request().url().split("/");
    const franchiseIdToDelete = parseInt(urlParts[urlParts.length - 1]);

    mockFranchises = mockFranchises.filter((f) => f.id !== franchiseIdToDelete);

    await route.fulfill({
      status: 200,
      json: { message: "franchise deleted" },
    });
  });

  // Get a franchisee's franchise
  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    const userFranchiseRes = [
      {
        id: 2,
        name: "pizzaPocket",
        admins: [{ id: 4, name: "Jared Franchisee", email: "f@jwt.com" }],
        stores: mockStores,
      },
    ];

    await route.fulfill({ json: userFranchiseRes });
  });

  // Create a store
  await page.route(/\/api\/franchise\/\d+\/store$/, async (route) => {
    const requestBody = route.request().postDataJSON();
    const storeResponse = {
      id: Math.floor(Math.random() * 1000), // Simulate a new database ID
      franchiseId: requestBody.franchiseId,
      name: requestBody.name,
      totalRevenue: 0,
    };

    mockStores.push(storeResponse);
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      json: storeResponse,
    });
  });

  //Delete a store
  await page.route(/\/api\/franchise\/\d+\/store\/\d+$/, async (route) => {
    const urlParts = route.request().url().split("/");
    const storeIdToDelete = parseInt(urlParts[urlParts.length - 1]);

    expect(route.request().method()).toBe("DELETE");

    mockStores = mockStores.filter((store) => store.id !== storeIdToDelete);

    await route.fulfill({
      status: 200,
      json: { message: "store deleted" },
    });
  });

  // Order a pizza.
  await page.route("*/**/api/order", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }

    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: "eyJpYXQ",
    };
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ json: orderRes });
  });

  // Get a person's orders
  await page.route("*/**/api/order", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }

    const orderRes = {
      dinerId: 2,
      orders: [
        {
          id: 166,
          franchiseId: 2,
          storeId: 4,
          date: "2025-09-12T22:14:00.000Z",
          items: [
            {
              id: 782,
              menuId: 1,
              description: "Veggie",
              price: 0.0038,
            },
          ],
        },
        {
          id: 167,
          franchiseId: 2,
          storeId: 3,
          date: "2025-09-12T22:16:33.000Z",
          items: [
            {
              id: 783,
              menuId: 1,
              description: "Veggie",
              price: 0.0038,
            },
          ],
        },
      ],
      page: 1,
    };

    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: orderRes });
  });

  //Update a user
  await page.route(/\/api\/user\/\d+$/, async (route) => {
    if (route.request().method() !== "PUT") {
      return route.fallback();
    }

    const updatedUserReq = route.request().postDataJSON();

    loggedInUser = {
      ...loggedInUser,
      ...updatedUserReq,
    };

    const userKey = Object.keys(validUsers).find(
      (k) => validUsers[k].id === loggedInUser?.id,
    );
    if (userKey) {
      validUsers[userKey] = { ...validUsers[userKey], ...updatedUserReq };
    }

    const updateRes = {
      user: loggedInUser,
      token: "abcdef-new-token",
    };

    await route.fulfill({
      status: 200,
      json: updateRes,
    });
  });

  await page.goto("/");
}

test("login", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();
});

test("register", async ({ page }) => {
  await basicInit(page);
  const testName = randomName();

  await page.getByRole("link", { name: "Register" }).click();

  await expect(page.getByRole("heading")).toContainText("Welcome to the party");

  await page.getByRole("textbox", { name: "Full name" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill(testName);
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(testName + "@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("randomPass");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByRole("heading")).toContainText("The web's best pizza");
});

test("login, then logout", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await page.getByRole("link", { name: "Logout" }).click();

  await expect(page.locator("#navbar-dark")).toContainText("Login");
  await expect(page.locator("#navbar-dark")).toContainText("Register");
});

test("login and visit franchise dashboard", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("diner");
  await page.getByRole("button", { name: "Login" }).click();

  await page
    .getByLabel("Global")
    .getByRole("link", { name: "Franchise" })
    .click();

  await expect(page.getByRole("alert")).toContainText(
    "If you are already a franchisee, pleaseloginusing your franchise account",
  );
  await expect(page.getByRole("main")).toContainText("Unleash Your Potential");
  await expect(page.getByRole("main")).toContainText(
    "So you want a piece of the pie?",
  );
  await expect(page.locator("thead")).toContainText("Year");
  await expect(page.locator("thead")).toContainText("Profit");
  await expect(page.locator("thead")).toContainText("Costs");
  await expect(page.locator("thead")).toContainText("Franchise Fee");
});

test("login and go to diner dashboard", async ({ page }) => {
  await basicInit(page);

  //Login
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "KC" }).click();

  //Look at diner dashboard
  await expect(page.getByRole("heading")).toContainText("Your pizza kitchen");
  await expect(page.getByRole("main")).toContainText("d@jwt.com");
  await expect(page.getByRole("main")).toContainText("diner");
  await expect(page.getByRole("main")).toContainText(
    "Here is your history of all the good times.",
  );
  await expect(page.locator("thead")).toContainText("ID");
  await expect(page.locator("thead")).toContainText("Price");
  await expect(page.locator("thead")).toContainText("Date");
});

test("purchase with login and verify", async ({ page }) => {
  await basicInit(page);

  // Go to order page
  await page.getByRole("button", { name: "Order now" }).click();

  // Create order
  await expect(page.locator("h2")).toContainText("Awesome is a click away");
  await page.getByRole("combobox").selectOption("4");
  await page.getByRole("link", { name: "Image Description Veggie A" }).click();
  await page.getByRole("link", { name: "Image Description Pepperoni" }).click();
  await expect(page.locator("form")).toContainText("Selected pizzas: 2");
  await page.getByRole("button", { name: "Checkout" }).click();

  // Login
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Email address" }).press("Tab");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  // Pay
  await expect(page.getByRole("main")).toContainText(
    "Send me those 2 pizzas right now!",
  );
  await expect(page.locator("tbody")).toContainText("Veggie");
  await expect(page.locator("tbody")).toContainText("Pepperoni");
  await expect(page.locator("tfoot")).toContainText("0.008 ₿");
  await page.getByRole("button", { name: "Pay now" }).click();

  // Check balance
  await expect(page.getByRole("heading")).toContainText(
    "Here is your JWT Pizza!",
  );
  await expect(page.getByRole("main")).toContainText("0.008 ₿");
  await expect(page.getByRole("main")).toContainText("2");
  await expect(page.getByText("0.008")).toBeVisible();

  // Verify
  await expect(page.getByRole("main")).toContainText("Verify");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#hs-jwt-modal")).toContainText("Close");
});

test("purchase with register", async ({ page }) => {
  await basicInit(page);
  const testName = randomName();

  // Go to order page
  await page.getByRole("button", { name: "Order now" }).click();

  // Create order
  await expect(page.locator("h2")).toContainText("Awesome is a click away");
  await page.getByRole("combobox").selectOption("4");
  await page.getByRole("link", { name: "Image Description Veggie A" }).click();
  await page.getByRole("link", { name: "Image Description Pepperoni" }).click();
  await expect(page.locator("form")).toContainText("Selected pizzas: 2");
  await page.getByRole("button", { name: "Checkout" }).click();

  //Register
  await page.getByRole("main").getByText("Register").click();
  await page.getByRole("textbox", { name: "Full name" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill(testName);
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(testName + "@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("randomPassword");
  await page.getByRole("button", { name: "Register" }).click();

  //Payment
  await expect(page.getByRole("heading")).toContainText("So worth it");
  await expect(page.getByRole("main")).toContainText(
    "Send me those 2 pizzas right now!",
  );
  await expect(page.locator("tfoot")).toContainText("0.008 ₿");
  await page.getByRole("button", { name: "Pay now" }).click();

  //Check balance
  await expect(page.getByRole("heading")).toContainText(
    "Here is your JWT Pizza!",
  );
  await expect(page.getByRole("main")).toContainText("2");
  await expect(page.getByRole("main")).toContainText("0.008 ₿");
});

test("Navigate to the about page", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("main")).toContainText("The secret sauce");
  await expect(page.getByRole("main")).toContainText("Our employees");
  await page.getByRole("img", { name: "Employee stock photo" }).first().click();
});

test("Navigate to history page", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading")).toContainText("Mama Rucci, my my");
  await expect(page.getByRole("main")).toContainText(
    "However, it was the Romans who truly popularized pizza-like dishes. They would top their flatbreads with various ingredients such as cheese, honey, and bay leaves.",
  );
});

test("Navigate to franchise page not logged in", async ({ page }) => {
  await basicInit(page);

  await page
    .getByLabel("Global")
    .getByRole("link", { name: "Franchise" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "If you are already a franchisee, pleaseloginusing your franchise account",
  );
  await expect(page.getByRole("main")).toContainText("Call now");
  await expect(page.getByRole("main")).toContainText("800-555-5555");
  await expect(page.locator("tbody")).toContainText("2020");
  await expect(page.locator("thead")).toContainText("Year");
  await expect(page.locator("thead")).toContainText("Profit");
  await expect(page.locator("thead")).toContainText("Costs");
  await expect(page.locator("thead")).toContainText("Franchise Fee");
  await expect(page.getByRole("main")).toContainText("Unleash Your Potential");
});

test("Login as Franchisee and go diner dashboard", async ({ page }) => {
  await basicInit(page);

  // Login as Franchisee
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("franchisee");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "JF" }).click();

  // Check for franchisee role
  await expect(page.getByRole("main")).toContainText(", Franchisee on 1");
  await expect(page.getByRole("main")).toContainText("f@jwt.com");
});

test("Go To Franchise Dashboard", async ({ page }) => {
  await basicInit(page);

  //Login as franchisee
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("franchisee");
  await page.getByRole("button", { name: "Login" }).click();

  //Go to franchise dashboard
  await page
    .getByLabel("Global")
    .getByRole("link", { name: "Franchise" })
    .click();
  await expect(page.getByRole("heading")).toContainText("pizzaPocket");
  await expect(page.getByRole("main")).toContainText("Create store");
  await expect(page.getByRole("main")).toContainText(
    "Everything you need to run an JWT Pizza franchise. Your gateway to success.",
  );
});

test("Login as Franchisee and Create a store", async ({ page }) => {
  await basicInit(page);
  const randomStoreName = randomName();

  // Login
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("franchisee");
  await page.getByRole("button", { name: "Login" }).click();

  //Navigate to franchise dashboard
  await page
    .getByLabel("Global")
    .getByRole("link", { name: "Franchise" })
    .click();

  //Create a store
  await expect(page.getByRole("main")).toContainText("Create store");
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByRole("heading")).toContainText("Create store");
  await expect(page.locator("form")).toContainText("Cancel");
  await expect(page.locator("form")).toContainText("Create");
  await page.getByRole("textbox", { name: "store name" }).click();
  await page.getByRole("textbox", { name: "store name" }).fill(randomStoreName);
  await page.getByRole("button", { name: "Create" }).click();

  //Check and make sure store was created
  await expect(page.locator("tbody")).toContainText(randomStoreName);
});

test("Login as Franchisee and Delete a store", async ({ page }) => {
  await basicInit(page);
  const randomStoreName = randomName();

  // Login as franchisee
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("franchisee");
  await page.getByRole("button", { name: "Login" }).click();

  //Navigate to franchise dashboard
  await page
    .getByLabel("Global")
    .getByRole("link", { name: "Franchise" })
    .click();

  // Open a temp store
  await page.getByRole("button", { name: "Create store" }).click();
  await page.getByRole("textbox", { name: "store name" }).click();
  await page.getByRole("textbox", { name: "store name" }).fill(randomStoreName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("tbody")).toContainText("Close");
  await expect(page.locator("tbody")).toContainText(randomStoreName);

  //
  await page
    .getByRole("row", { name: `${randomStoreName} 0 ₿ Close` })
    .getByRole("button")
    .click();
  await expect(page.getByRole("heading")).toContainText("Sorry to see you go");
  await expect(page.getByRole("main")).toContainText(
    `Are you sure you want to close the pizzaPocket store ${randomStoreName} ? This cannot be restored. All outstanding revenue will not be refunded.`,
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("tbody")).not.toContainText(randomStoreName);
});

test("Login as admin and go to admin dashboard", async ({ page }) => {
  await basicInit(page);

  // Login as admin
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  // Go to admin dashboard
  await expect(page.locator("#navbar-dark")).toContainText("Admin");
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("list")).toContainText("admin-dashboard");
  await expect(page.locator("h2")).toContainText("Mama Ricci's kitchen");
  await expect(page.locator("h3")).toContainText("Franchises");
  await expect(page.getByRole("main")).toContainText("Add Franchise");

  await expect(page.locator("table")).toContainText("LotaPizza");
});

test("Login as admin and add a new franchise", async ({ page }) => {
  await basicInit(page);
  const randomFranchiseName = randomName();

  // Login
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "Admin" }).click();

  //Add franchise
  await expect(page.locator("tfoot")).toContainText("Submit");
  await expect(
    page.getByRole("button", { name: "Add Franchise" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Add Franchise");

  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByRole("textbox", { name: "franchise name" }).click();
  await page
    .getByRole("textbox", { name: "franchise name" })
    .fill(randomFranchiseName);
  await page.getByRole("textbox", { name: "franchisee admin email" }).click();
  await page
    .getByRole("textbox", { name: "franchisee admin email" })
    .fill("a@jwt.com");
  await expect(page.getByRole("heading")).toContainText("Create franchise");
  await expect(page.getByText("Want to create franchise?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

  // Check for creation
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("table")).toContainText(randomFranchiseName);
  await expect(page.getByRole("table")).toContainText("Aaron Admin");
});

test("Add a franchise, then remove a franchise", async ({ page }) => {
  await basicInit(page);
  const randomFranchiseName = randomName();

  // Login as admin
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  // Add test franchise
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByRole("textbox", { name: "franchise name" }).click();
  await page
    .getByRole("textbox", { name: "franchise name" })
    .fill(randomFranchiseName);
  await page.getByRole("textbox", { name: "franchisee admin email" }).click();
  await page
    .getByRole("textbox", { name: "franchisee admin email" })
    .fill("a@jwt.com");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("table")).toContainText(randomFranchiseName);
  await expect(page.getByRole("table")).toContainText("Aaron Admin");
  await expect(
    page
      .getByRole("row", { name: `${randomFranchiseName} Aaron Admin Close` })
      .getByRole("button"),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Close");
  await page
    .getByRole("row", { name: `${randomFranchiseName} Aaron Admin Close` })
    .getByRole("button")
    .click();
  await expect(page.getByRole("heading")).toContainText("Sorry to see you go");
  await expect(page.getByRole("main")).toContainText("Close");
  await expect(page.getByRole("main")).toContainText(
    `Are you sure you want to close the ${randomFranchiseName} franchise? This will close all associated stores and cannot be restored. All outstanding revenue will not be refunded.`,
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("table")).not.toContainText(randomFranchiseName);
});

test("update user test", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Register" }).click();
  await page.getByRole("textbox", { name: "Full name" }).fill("Kai Chen");
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Register" }).click();

  await page.getByRole("link", { name: "KC" }).click();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("h3")).toContainText("Edit user");
  await page.getByRole("textbox").first().fill("pizza dinerx");
  await page.getByRole("button", { name: "Update" }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: "attached" });

  await expect(page.getByRole("main")).toContainText("pizza dinerx");

  await page.getByRole("link", { name: "Logout" }).click();
  await page.getByRole("link", { name: "Login" }).click();

  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await page.getByRole("link", { name: "pd" }).click();

  await expect(page.getByRole("main")).toContainText("pizza dinerx");
});
