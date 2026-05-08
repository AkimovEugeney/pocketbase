migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  users.fields.add(
    new SelectField({
      name: "plan_code",
      required: false,
      maxSelect: 1,
      values: ["free", "pro", "expert"],
    }),
    new SelectField({
      name: "billing_period",
      required: false,
      maxSelect: 1,
      values: ["month", "year"],
    }),
    new SelectField({
      name: "subscription_status",
      required: false,
      maxSelect: 1,
      values: ["trial", "active", "expired", "canceled", "past_due"],
    }),
    new DateField({
      name: "subscription_ends_at",
      required: false,
    }),
    new BoolField({
      name: "trial_used",
      required: false,
    }),
    new DateField({
      name: "trial_ends_at",
      required: false,
    }),
  );

  app.save(users);

  app.db().newQuery(
    "UPDATE users SET plan_code = 'free' WHERE COALESCE(plan_code, '') = ''",
  ).execute();
  app.db().newQuery(
    "UPDATE users SET subscription_status = 'active' WHERE COALESCE(subscription_status, '') = ''",
  ).execute();
  app.db().newQuery(
    "UPDATE users SET trial_used = 0 WHERE trial_used IS NULL",
  ).execute();

  let billingPlans;

  try {
    billingPlans = app.findCollectionByNameOrId("billing_plans");
  } catch (_) {
    billingPlans = new Collection({
      name: "billing_plans",
      type: "base",
      listRule: "@request.auth.id != \"\" && is_active = true",
      viewRule: "@request.auth.id != \"\" && is_active = true",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "code",
          type: "text",
          required: true,
          min: 2,
          max: 32,
          pattern: "^[a-z0-9_]+$",
        },
        {
          name: "title",
          type: "text",
          required: true,
          min: 2,
          max: 100,
        },
        {
          name: "is_active",
          type: "bool",
          required: true,
        },
        {
          name: "students_limit",
          type: "number",
          required: false,
          min: 0,
          onlyInt: true,
        },
        {
          name: "students_unlimited",
          type: "bool",
          required: true,
        },
        {
          name: "allow_student_subscriptions",
          type: "bool",
          required: true,
        },
        {
          name: "allow_group_lessons",
          type: "bool",
          required: true,
        },
        {
          name: "allow_homework_module",
          type: "bool",
          required: true,
        },
        {
          name: "price_month",
          type: "number",
          required: false,
          min: 0,
          onlyInt: true,
        },
        {
          name: "price_year",
          type: "number",
          required: false,
          min: 0,
          onlyInt: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_plans_code ON billing_plans (code)",
      ],
    });
  }

  app.save(billingPlans);

  const planSeeds = [
    {
      code: "free",
      title: "Free",
      is_active: true,
      students_limit: 10,
      students_unlimited: false,
      allow_student_subscriptions: false,
      allow_group_lessons: false,
      allow_homework_module: false,
      price_month: 0,
      price_year: 0,
    },
    {
      code: "pro",
      title: "Pro",
      is_active: true,
      students_limit: 50,
      students_unlimited: false,
      allow_student_subscriptions: true,
      allow_group_lessons: true,
      allow_homework_module: true,
      price_month: null,
      price_year: null,
    },
    {
      code: "expert",
      title: "Expert",
      is_active: true,
      students_limit: null,
      students_unlimited: true,
      allow_student_subscriptions: true,
      allow_group_lessons: true,
      allow_homework_module: true,
      price_month: null,
      price_year: null,
    },
  ];

  for (const planData of planSeeds) {
    const found = app.findRecordsByFilter(
      "billing_plans",
      `code = \"${planData.code}\"`,
      "",
      1,
      0,
    );

    const record = found.length > 0 ? found[0] : new Record(billingPlans);

    record.set("code", planData.code);
    record.set("title", planData.title);
    record.set("is_active", planData.is_active);
    record.set("students_limit", planData.students_limit);
    record.set("students_unlimited", planData.students_unlimited);
    record.set("allow_student_subscriptions", planData.allow_student_subscriptions);
    record.set("allow_group_lessons", planData.allow_group_lessons);
    record.set("allow_homework_module", planData.allow_homework_module);
    record.set("price_month", planData.price_month);
    record.set("price_year", planData.price_year);

    app.save(record);
  }
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("users");

    users.fields.removeByName("plan_code");
    users.fields.removeByName("billing_period");
    users.fields.removeByName("subscription_status");
    users.fields.removeByName("subscription_ends_at");
    users.fields.removeByName("trial_used");
    users.fields.removeByName("trial_ends_at");

    app.save(users);
  } catch (_) {}

  try {
    const billingPlans = app.findCollectionByNameOrId("billing_plans");
    app.delete(billingPlans);
  } catch (_) {}
});
