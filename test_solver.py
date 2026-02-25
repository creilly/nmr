import numpy as np

def run_test(toneVol):
    omega0 = 2 * np.pi * 300
    M0 = -1.0
    T1 = 1.0
    T2 = 0.5
    sampleDt = 1/48000
    M = np.array([0.0,0.0,-1.0])
    for i in range(48000):
        B1 = toneVol * np.sin(omega0*i*sampleDt)
        dMx = omega0 * M[1] - M[0] / T2
        dMy = M[2] * B1 - omega0 * M[0] - M[1] / T2
        dMz = -M[1] * B1 - (M[2] - M0) / T1
        M += np.array([dMx,dMy,dMz]) * sampleDt
        if np.linalg.norm(M) > 10:
            return ('blowup', i, M)
    return ('final', M, np.linalg.norm(M))

for vol in [1,3,10,20]:
    print(vol, run_test(vol))
