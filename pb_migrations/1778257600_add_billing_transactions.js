migrate((app) => {
  let collection;

  try {
    collection = app.findCollectionByNameOrId("billing_transactions");
  } catch (_) {
    collection = new Collection({
      name: "billing_transactions",
      type: "base",
      listRule: "@request.auth.id != \"\" && owner = @request.auth.id",
      viewRule: "@request.auth.id != \"\" && owner = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
        },
        {
          name: "provider",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["robokassa"],
        },
        {
          name: "inv_id",
          type: "text",
          required: true,
          min: 1,
          max: 100,
          pattern: "^[A-Za-z0-9_\\-]+$",
        },
        {
          name: "plan_code",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pro", "expert"],
        },
        {
          name: "billing_period",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["month", "year"],
        },
        {
          name: "amount",
          type: "number",
          required: true,
          min: 0,
          onlyInt: false,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "succeeded", "failed"],
        },
        {
          name: "provider_payment_id",
          type: "text",
          required: false,
          min: 0,
          max: 120,
          pattern: "",
        },
        {
          name: "raw_payload",
          type: "json",
          required: false,
        },
        {
          name: "created_at_provider",
          type: "date",
          required: false,
          min: "",
          max: "",
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_tx_inv_id ON billing_transactions (inv_id)",
        "CREATE INDEX IF NOT EXISTS idx_billing_tx_owner_created ON billing_transactions (owner, created)",
      ],
    });
  }

  app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("billing_transactions");
    app.delete(collection);
  } catch (_) {}
});
