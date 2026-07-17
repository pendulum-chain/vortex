import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Persisted block cursor for the poll-based mint watcher (one row per watcher name,
// e.g. "eure-mints:1"). lastBlock is the highest block already scanned; the next run
// resumes at lastBlock + 1 so a crash between getLogs and processing re-scans rather
// than skips (deposit writes are idempotent via the mint-log unique index).
export interface MoneriumChainCursorAttributes {
  name: string;
  lastBlock: string; // BIGINT, stringified
  createdAt: Date;
  updatedAt: Date;
}

type MoneriumChainCursorCreationAttributes = Optional<MoneriumChainCursorAttributes, "createdAt" | "updatedAt">;

class MoneriumChainCursor
  extends Model<MoneriumChainCursorAttributes, MoneriumChainCursorCreationAttributes>
  implements MoneriumChainCursorAttributes
{
  declare name: string;
  declare lastBlock: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

MoneriumChainCursor.init(
  {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    lastBlock: {
      allowNull: false,
      field: "last_block",
      type: DataTypes.BIGINT
    },
    name: {
      primaryKey: true,
      type: DataTypes.STRING(64)
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  },
  {
    modelName: "MoneriumChainCursor",
    sequelize,
    tableName: "monerium_chain_cursors"
  }
);

export default MoneriumChainCursor;
