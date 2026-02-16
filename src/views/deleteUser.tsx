import React from "react";
import View from "./view";
import Button from "../components/button";
import { useLocation } from "react-router";
import { useBreadcrumb } from "../hooks/appNavigation";
import { pizzaService } from "../service/service";

export default function DeleteUser() {
  const state = useLocation().state;
  const navigateToParent = useBreadcrumb();

  async function deleteUser() {
    await pizzaService.deleteUser(state.user);
    navigateToParent();
  }

  return (
    <View title="Delete User">
      <div className="text-start py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-neutral-100">
          Are you sure you want to delete the user{" "}
          <span className="text-orange-500">{state.user.name}</span>? This
          cannot be restored.
        </div>
        <Button title="Delete User" onPress={deleteUser} />
        <Button
          title="Cancel"
          onPress={navigateToParent}
          className="bg-transparent border-neutral-300"
        />
      </div>
    </View>
  );
}
