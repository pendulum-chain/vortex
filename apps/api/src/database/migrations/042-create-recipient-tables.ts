import { DataTypes, QueryInterface } from "sequelize";

// Recipient product tables (docs/architecture/recipient-transfers-schema.md, refined by the
// plan's D1/D3): recipient_invitations are LINK-based — token_hash is the redemption key and
// invitee_email is optional metadata; recipient_payout_references are thin pointers to
// provider-side instruments (no payout PII stored locally). All net-new, atomic revert.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("recipient_invitations", {
    accepted_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    accepted_by_profile_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    amount: {
      allowNull: true,
      type: DataTypes.DECIMAL(38, 18)
    },
    country: {
      allowNull: false,
      type: DataTypes.STRING(4)
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    created_by_profile_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    expires_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    invitee_email: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    invitee_email_canonical: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    invitee_type: {
      allowNull: false,
      defaultValue: "individual",
      type: DataTypes.STRING(16)
    },
    payout_currency: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    rail: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    revoked_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    sender_customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.STRING(16)
    },
    token_hash: {
      allowNull: false,
      type: DataTypes.STRING(128),
      unique: true
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("recipient_invitations", {
    fields: ["sender_customer_entity_id"],
    name: "fk_recipient_invitations_sender_entity",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("recipient_invitations", {
    fields: ["created_by_profile_id"],
    name: "fk_recipient_invitations_created_by_profile",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("recipient_invitations", {
    fields: ["accepted_by_profile_id"],
    name: "fk_recipient_invitations_accepted_by_profile",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE "recipient_invitations" ADD CONSTRAINT "chk_recipient_invitations_status" CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "recipient_invitations" ADD CONSTRAINT "chk_recipient_invitations_invitee_type" CHECK (invitee_type IN ('individual', 'business'));`
  );
  await queryInterface.addIndex("recipient_invitations", ["sender_customer_entity_id"], {
    name: "idx_recipient_invitations_sender_entity"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "recipient_invitations" ENABLE ROW LEVEL SECURITY;`);

  await queryInterface.createTable("sender_recipients", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    disabled_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    invitation_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    nickname: {
      allowNull: true,
      type: DataTypes.STRING(100)
    },
    recipient_customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    relationship_status: {
      allowNull: false,
      defaultValue: "invited",
      type: DataTypes.STRING(16)
    },
    sender_customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("sender_recipients", {
    fields: ["sender_customer_entity_id"],
    name: "fk_sender_recipients_sender_entity",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("sender_recipients", {
    fields: ["recipient_customer_entity_id"],
    name: "fk_sender_recipients_recipient_entity",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("sender_recipients", {
    fields: ["invitation_id"],
    name: "fk_sender_recipients_invitation",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "recipient_invitations"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("sender_recipients", {
    fields: ["sender_customer_entity_id", "recipient_customer_entity_id"],
    name: "uniq_sender_recipients_pair",
    type: "unique"
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE "sender_recipients" ADD CONSTRAINT "chk_sender_recipients_status" CHECK (relationship_status IN ('invited', 'active', 'blocked', 'archived'));`
  );
  await queryInterface.addIndex("sender_recipients", ["recipient_customer_entity_id"], {
    name: "idx_sender_recipients_recipient_entity"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "sender_recipients" ENABLE ROW LEVEL SECURITY;`);

  await queryInterface.createTable("recipient_payout_references", {
    country: {
      allowNull: false,
      type: DataTypes.STRING(4)
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    currency: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    instrument_type: {
      allowNull: false,
      type: DataTypes.STRING(20)
    },
    last_provider_sync_at: {
      allowNull: true,
      type: DataTypes.DATE
    },
    masked_display_label: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    provider: {
      allowNull: false,
      type: DataTypes.STRING(16)
    },
    provider_instrument_id: {
      allowNull: true,
      type: DataTypes.STRING(255)
    },
    rail: {
      allowNull: false,
      type: DataTypes.STRING(8)
    },
    recipient_customer_entity_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    sender_recipient_id: {
      allowNull: false,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "pending",
      type: DataTypes.STRING(16)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addConstraint("recipient_payout_references", {
    fields: ["sender_recipient_id"],
    name: "fk_recipient_payout_references_sender_recipient",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "sender_recipients"
    },
    type: "foreign key"
  });
  await queryInterface.addConstraint("recipient_payout_references", {
    fields: ["recipient_customer_entity_id"],
    name: "fk_recipient_payout_references_recipient_entity",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "customer_entities"
    },
    type: "foreign key"
  });
  await queryInterface.sequelize.query(
    `ALTER TABLE "recipient_payout_references" ADD CONSTRAINT "chk_recipient_payout_references_status" CHECK (status IN ('pending', 'verified', 'rejected', 'disabled'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "recipient_payout_references" ADD CONSTRAINT "chk_recipient_payout_references_provider" CHECK (provider IN ('mykobo', 'alfredpay', 'avenia'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "recipient_payout_references" ADD CONSTRAINT "chk_recipient_payout_references_instrument_type" CHECK (instrument_type IN ('pix', 'iban', 'clabe', 'ach', 'cbu_cvu', 'account_number'));`
  );
  // Single non-disabled reference per relationship/corridor (plan D3).
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ux_recipient_payout_references_corridor"
     ON "recipient_payout_references" (sender_recipient_id, country, rail) WHERE status <> 'disabled';`
  );
  await queryInterface.addIndex("recipient_payout_references", ["recipient_customer_entity_id"], {
    name: "idx_recipient_payout_references_recipient_entity"
  });
  await queryInterface.sequelize.query(`ALTER TABLE "recipient_payout_references" ENABLE ROW LEVEL SECURITY;`);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("recipient_payout_references");
  await queryInterface.dropTable("sender_recipients");
  await queryInterface.dropTable("recipient_invitations");
}
