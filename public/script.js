// === CONFIG ===
const API = 'http://localhost:4000';
let TOKEN = null;
let CURRENT_ROLE = null;
// Login Modal
const loginModal = document.getElementById('loginModal');
const closeModal = document.getElementById('closeModal');
const loginTitle = document.getElementById('loginTitle');

document.getElementById('loginUserBtn').onclick = () => {
  loginTitle.innerText = "Login as User";
  loginModal.style.display = 'block';
};

document.getElementById('loginProviderBtn').onclick = () => {
  loginTitle.innerText = "Login as Service Provider";
  loginModal.style.display = 'block';
};

closeModal.onclick = () => {
  loginModal.style.display = 'none';
};

window.onclick = (event) => {
  if (event.target == loginModal) {
    loginModal.style.display = 'none';
  }
};

// Nurse Booking
function calculateNurseCost() {
  let hours = document.getElementById('nurseHours').value;
  let rate = 200;
  if (hours > 0) {
    document.getElementById('nurseCost').innerText = "Total: ₹" + (hours * rate);
  } else {
    alert("Please enter valid hours.");
  }
}

// Subscription
function calculateSubscriptionCost() {
  let days = document.getElementById('subscriptionDays').value;
  let rate = 1000;
  if (days > 0) {
    document.getElementById('subscriptionCost').innerText = "Total: ₹" + (days * rate);
  } else {
    alert("Please enter valid days.");
  }
}

// Ambulance
function calculateAmbulanceCost() {
  let distance = document.getElementById('ambulanceDistance').value;
  let rate = 50;
  if (distance > 0) {
    document.getElementById('ambulanceCost').innerText = "Total: ₹" + (distance * rate);
  } else {
    alert("Please enter valid distance.");
  }
}
