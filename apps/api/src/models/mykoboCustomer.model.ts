import { MykoboCustomerStatus, MykoboCustomerType } from "@vortexfi/shared";
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface MykoboCustomerAttributes {
  id: string;
  userId: string;
  email: string;
  status: MykoboCustomerStatus;
  statusExternal: string | null;
  lastFailureReasons: string[] | null;
  type: MykoboCustomerType;
  createdAt: Date;
  updatedAt: Date;
}

type MykoboCustomerCreationAttributes = Optional<
  MykoboCustomerAttributes,
  "id" | "createdAt" | "updatedAt" | "statusExternal" | "lastFailureReasons" | "status" | "type"
>;

class MykoboCustomer
  extends Model<MykoboCustomerAttributes, MykoboCustomerCreationAttributes>
  implements MykoboCustomerAttributes
{
  declare id: string;
  declare userId: string;
  declare email: string;
  declare status: MykoboCustomerStatus;
  declare statusExternal: string | null;
  declare lastFailureReasons: string[] | null;
  declare type: MykoboCustomerType;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MykoboCustomer.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    email: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    lastFailureReasons: {
      allowNull: true,
      defaultValue: [],
      field: "last_failure_reasons",
      type: DataTypes.ARRAY(DataTypes.STRING)
    },
    status: {
      allowNull: false,
      defaultValue: MykoboCustomerStatus.CONSULTED,
      type: DataTypes.ENUM(...Object.values(MykoboCustomerStatus))
    },
    statusExternal: {
      allowNull: true,
      comment: "Mykobo's raw kyc_status.review_status",
      field: "status_external",
      type: DataTypes.STRING
    },
    type: {
      allowNull: false,
      defaultValue: MykoboCustomerType.INDIVIDUAL,
      type: DataTypes.ENUM(...Object.values(MykoboCustomerType))
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: false,
      field: "user_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID,
      unique: true
    }
  },
  {
    indexes: [
      {
        fields: ["user_id"],
        name: "idx_mykobo_customers_user_id",
        unique: true
      },
      {
        fields: ["email"],
        name: "idx_mykobo_customers_email",
        unique: true
      }
    ],
    modelName: "MykoboCustomer",
    sequelize,
    tableName: "mykobo_customers",
    timestamps: true
  }
);

export default MykoboCustomer;
