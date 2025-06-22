import torch
import torch.nn as nn
import torch.nn.functional as F
import pandas as pd
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import accuracy_score


# --- Dataset Class ---
class SignLanguageMNIST(Dataset):
    def __init__(self, csv_file):
        df = pd.read_csv(csv_file)
        self.labels = df['label'].values
        self.images = df.drop('label', axis=1).values.reshape(-1, 1, 28, 28).astype('float32') / 255.0

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        image = torch.tensor(self.images[idx])
        label = torch.tensor(self.labels[idx]).long()
        return image, label


# --- CNN Model ---
class BetterASLModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)

        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)

        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm2d(128)

        self.dropout = nn.Dropout(0.3)
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(128, 26)

    def forward(self, x):
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.max_pool2d(x, 2)

        x = F.relu(self.bn2(self.conv2(x)))
        x = F.max_pool2d(x, 2)

        x = F.relu(self.bn3(self.conv3(x)))
        x = self.global_pool(x)
        x = x.view(x.size(0), -1)

        x = self.dropout(x)
        return self.fc(x)


# --- Only run this when called directly (NOT when imported) ---
if __name__ == "__main__":
    # Load data
    train_csv = "../data-mnist/archive/sign_mnist_train.csv"
    test_csv = "../data-mnist/archive/sign_mnist_test.csv"

    train_dataset = SignLanguageMNIST(train_csv)
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)

    test_dataset = SignLanguageMNIST(test_csv)
    test_loader = DataLoader(test_dataset, batch_size=64)

    # Init model
    model = BetterASLModel()
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters())

    # Training loop
    print("🧠 Training model...")
    for epoch in range(20):
        model.train()
        total_loss = 0
        for images, labels in train_loader:
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        print(f"✅ Epoch {epoch + 1}/20 | Loss: {total_loss:.4f}")

    # Save model
    torch.save(model.state_dict(), "model.pth")
    print("💾 Model saved to model.pth")

    # Evaluate
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in test_loader:
            outputs = model(images)
            preds = torch.argmax(outputs, dim=1)
            all_preds.extend(preds.numpy())
            all_labels.extend(labels.numpy())

    accuracy = accuracy_score(all_labels, all_preds)
    print(f"📈 Validation Accuracy: {accuracy * 100:.2f}%")
