# backend/convert2onnx.py
import torch
from trainmodel import BetterASLModel

model = BetterASLModel()
model.load_state_dict(torch.load("model.pth"))
model.eval()

dummy_input = torch.randn(1, 1, 28, 28)
torch.onnx.export(model, (dummy_input,), "model.onnx",
                  input_names=['input'], output_names=['output'],
                  dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}})

print("Model exported to model.onnx")


