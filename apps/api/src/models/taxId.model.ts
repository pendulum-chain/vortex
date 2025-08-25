import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

export interface TaxIdAttributes {
  taxId: string;
  createdAt: Date;
  updatedAt: Date;
}

class TaxId extends Model<TaxIdAttributes> implements TaxIdAttributes {
  declare taxId: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

TaxId.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    taxId: {
      primaryKey: true,
      type: DataTypes.STRING
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  },
  {
    indexes: [],
    modelName: "TaxId",
    sequelize,
    tableName: "tax_ids",
    timestamps: true
  }
);

export default TaxId;
