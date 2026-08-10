function App() {
  return (
    <main className="page">
      <section className="order-entry">
        <header className="order-entry__header">
          <p className="eyebrow">Boutique Orders</p>

          <h1>New Order</h1>

          <p className="intro">
            Capture a manually received Instagram or WhatsApp order.
          </p>
        </header>

        <form className="order-form">
          <label>
            Customer reference

            <input
              type="text"
              name="customerReference"
              placeholder="@customer or phone number"
            />
          </label>

          <label>
            Channel

            <select name="channel" defaultValue="">
              <option value="" disabled>
                Select a channel
              </option>

              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>

          <label>
            Item

            <input
              type="text"
              name="itemDescription"
              placeholder="Black linen dress, size 40"
            />
          </label>

          <label>
            Quantity

            <input
              type="number"
              name="quantity"
              min="1"
              defaultValue="1"
            />
          </label>

          <button type="submit">Create order</button>
        </form>
      </section>
    </main>
  );
}

export default App;