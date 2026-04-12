function showToast(message, type = "success") {

  const toast = document.getElementById("toast");

  toast.innerText = message;

  // reset classes
  toast.className = "fixed top-5 right-5 px-6 py-3 rounded shadow text-white";

  if (type === "success") {
    toast.classList.add("bg-green-500");
  } else if (type === "error") {
    toast.classList.add("bg-red-500");
  } else {
    toast.classList.add("bg-gray-700");
  }

  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}