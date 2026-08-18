import { describe, expect, it } from "bun:test";
import models from "./index";

describe("managed profile models", () => {
  it("registers the manager and child profile relationships", () => {
    expect(models.User.associations).toHaveProperty("managedProfileManager");
    expect(models.User.associations).toHaveProperty("managedProfileRelationship");
    expect(models.ManagedProfileManager.associations).toHaveProperty("managedProfiles");
    expect(models.ManagedProfile.associations).toHaveProperty("manager");
    expect(models.ManagedProfile.associations).toHaveProperty("profile");
  });

  it("maps the profile kind and managed-profile fields", () => {
    expect(models.User.getAttributes().kind.defaultValue).toBe("authenticated");
    expect(models.User.getAttributes().email.allowNull).toBe(true);
    expect(models.ManagedProfileManager.getAttributes().allowedCorridors.field).toBe("allowed_corridors");
    expect(models.ManagedProfileManager.getAttributes().allowedCustomerTypes.field).toBe("allowed_customer_types");
    expect(models.ManagedProfile.getAttributes().externalSubjectId.field).toBe("external_subject_id");
    expect(models.ManagedProfile.getAttributes().contactEmail.field).toBe("contact_email");
    expect(models.ManagedProfile.getAttributes().managerProfileId.field).toBe("manager_profile_id");
  });
});
